import { randomUUID } from "node:crypto";
import type {
  AnalyticsFunnel,
  AuditEvent,
  ChatSession,
  HandoffEvent,
  IngestSource,
  KnowledgeDocument,
  LeadProfile,
  QualificationScore,
  TenantConfig,
} from "./types.js";
import type { FunnelDelta, PlatformStore } from "./platformStore.js";

const nowIso = () => new Date().toISOString();

function defaultFunnel(tenantId: string): AnalyticsFunnel {
  return {
    tenantId,
    visits: 0,
    chatsStarted: 0,
    qualifiedLeads: 0,
    meetingsBooked: 0,
    bookings: 0,
    ctrToSignup: 0,
  };
}

export class InMemoryPlatformStore implements PlatformStore {
  private readonly tenants = new Map<string, TenantConfig>();
  private readonly sources = new Map<string, IngestSource[]>();
  private readonly sessions = new Map<string, ChatSession>();
  private readonly leads = new Map<string, LeadProfile>();
  private readonly qualifications = new Map<string, QualificationScore>();
  private readonly handoffs = new Map<string, HandoffEvent>();
  private readonly docs = new Map<string, KnowledgeDocument[]>();
  private readonly audits = new Map<string, AuditEvent[]>();
  private readonly funnel = new Map<string, AnalyticsFunnel>();

  async ensureTenant(tenant: TenantConfig): Promise<TenantConfig> {
    if (!this.tenants.has(tenant.tenantId)) {
      this.tenants.set(tenant.tenantId, tenant);
      this.funnel.set(tenant.tenantId, defaultFunnel(tenant.tenantId));
      this.sources.set(tenant.tenantId, []);
      this.docs.set(tenant.tenantId, []);
      this.audits.set(tenant.tenantId, []);
    } else {
      this.tenants.set(tenant.tenantId, tenant);
    }

    return this.tenants.get(tenant.tenantId)!;
  }

  async getTenant(tenantId: string): Promise<TenantConfig | undefined> {
    return this.tenants.get(tenantId);
  }

  async addAudit(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    actorType: AuditEvent["actorType"],
    metadata: Record<string, string> = {},
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      tenantId,
      action,
      actorType,
      resourceType,
      resourceId,
      metadata,
      createdAt: nowIso(),
    };

    const list = this.audits.get(tenantId) ?? [];
    list.push(event);
    this.audits.set(tenantId, list);
  }

  async registerSource(source: IngestSource): Promise<IngestSource> {
    const list = this.sources.get(source.tenantId) ?? [];
    const existingIdx = list.findIndex((s) => s.sourceId === source.sourceId);
    if (existingIdx >= 0) {
      list[existingIdx] = source;
    } else {
      list.push(source);
    }
    this.sources.set(source.tenantId, list);

    await this.addAudit(source.tenantId, "ingest_source_registered", "ingest_source", source.sourceId, "system", {
      kind: source.kind,
      uri: source.uri,
    });

    return source;
  }

  async listSources(tenantId: string): Promise<IngestSource[]> {
    return this.sources.get(tenantId) ?? [];
  }

  async upsertDocs(tenantId: string, docs: KnowledgeDocument[]): Promise<number> {
    const existing = this.docs.get(tenantId) ?? [];
    const byId = new Map(existing.map((d) => [d.id, d]));

    for (const doc of docs) {
      byId.set(doc.id, doc);
    }

    this.docs.set(tenantId, [...byId.values()]);
    await this.addAudit(tenantId, "docs_upserted", "knowledge_document", tenantId, "system", {
      count: String(docs.length),
    });

    return docs.length;
  }

  async getDocs(tenantId: string): Promise<KnowledgeDocument[]> {
    return this.docs.get(tenantId) ?? [];
  }

  async getCandidateDocsForQuery(tenantId: string, _query: string, _topK: number): Promise<KnowledgeDocument[]> {
    return this.getDocs(tenantId);
  }

  async createSession(session: ChatSession): Promise<ChatSession> {
    this.sessions.set(session.sessionId, session);
    await this.updateFunnel(session.tenantId, { visits: 1, chatsStarted: 1 });

    await this.addAudit(session.tenantId, "chat_session_created", "chat_session", session.sessionId, "visitor", {
      siteId: session.siteId,
      consent: String(session.consentGiven),
    });

    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    return this.sessions.get(sessionId);
  }

  async updateSession(session: ChatSession): Promise<ChatSession> {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async upsertLead(lead: LeadProfile): Promise<LeadProfile> {
    this.leads.set(lead.sessionId, lead);
    await this.addAudit(lead.tenantId, "lead_upserted", "lead_profile", lead.leadId, "system");
    return lead;
  }

  async getLeadBySession(sessionId: string): Promise<LeadProfile | undefined> {
    return this.leads.get(sessionId);
  }

  async saveQualification(score: QualificationScore): Promise<QualificationScore> {
    const previous = this.qualifications.get(score.sessionId);
    this.qualifications.set(score.sessionId, score);
    const crossedThreshold = (previous?.overallScore ?? 0) < 0.72 && score.overallScore >= 0.72;
    if (crossedThreshold) {
      await this.updateFunnel(score.tenantId, { qualifiedLeads: 1 });
    }

    await this.addAudit(score.tenantId, "qualification_saved", "qualification_score", score.sessionId, "system", {
      score: String(score.overallScore),
    });

    return score;
  }

  async getQualification(sessionId: string): Promise<QualificationScore | undefined> {
    return this.qualifications.get(sessionId);
  }

  async saveHandoff(handoff: HandoffEvent): Promise<HandoffEvent> {
    this.handoffs.set(handoff.handoffId, handoff);
    await this.addAudit(handoff.tenantId, "handoff_saved", "handoff_event", handoff.handoffId, "system", {
      status: handoff.status,
    });
    return handoff;
  }

  async getFunnel(tenantId: string): Promise<AnalyticsFunnel> {
    return this.funnel.get(tenantId) ?? defaultFunnel(tenantId);
  }

  async updateFunnel(tenantId: string, delta: FunnelDelta): Promise<AnalyticsFunnel> {
    const current = this.funnel.get(tenantId) ?? defaultFunnel(tenantId);
    current.visits += delta.visits ?? 0;
    current.chatsStarted += delta.chatsStarted ?? 0;
    current.qualifiedLeads += delta.qualifiedLeads ?? 0;
    current.meetingsBooked += delta.meetingsBooked ?? 0;
    current.bookings += delta.bookings ?? 0;
    current.ctrToSignup = current.visits === 0 ? 0 : current.qualifiedLeads / current.visits;
    this.funnel.set(tenantId, current);
    return current;
  }

  async getAudits(tenantId: string): Promise<AuditEvent[]> {
    return this.audits.get(tenantId) ?? [];
  }

  async purgeExpiredSessions(tenantId: string, retentionDays: number): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let purged = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.tenantId === tenantId && new Date(session.updatedAt).getTime() < cutoff) {
        this.sessions.delete(sessionId);
        this.leads.delete(sessionId);
        this.qualifications.delete(sessionId);
        purged += 1;
      }
    }

    return purged;
  }
}

export const defaultTenant: TenantConfig = {
  tenantId: "tenant_luxe_demo",
  tenantName: "Luxe Voyages",
  podId: "pod_luxe_demo",
  allowedDomains: ["luxevoyages.example"],
  crmProvider: "hubspot",
  dataRetentionDays: 365,
  encryptionKeyId: "kms-key-luxe-demo",
  highIntentThreshold: 0.72,
};
