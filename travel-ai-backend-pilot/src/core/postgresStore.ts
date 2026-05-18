import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
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
import { embedText, embedTexts, vectorToPgLiteral } from "../rag/embeddings.js";

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

function mapTenant(row: Record<string, unknown>): TenantConfig {
  return {
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name),
    podId: String(row.pod_id),
    allowedDomains: (row.allowed_domains as string[]) ?? [],
    crmProvider: row.crm_provider as TenantConfig["crmProvider"],
    dataRetentionDays: Number(row.data_retention_days),
    encryptionKeyId: String(row.encryption_key_id),
    highIntentThreshold: Number(row.high_intent_threshold),
  };
}

function mapDoc(row: Record<string, unknown>): KnowledgeDocument {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    sourceId: String(row.source_id),
    title: String(row.title),
    domain: row.domain as KnowledgeDocument["domain"],
    content: String(row.content),
    metadata: row.metadata as KnowledgeDocument["metadata"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresPlatformStore implements PlatformStore {
  constructor(private readonly pool: Pool) {}

  async ensureTenant(tenant: TenantConfig): Promise<TenantConfig> {
    await this.pool.query(
      `
      INSERT INTO tenants (tenant_id, tenant_name, pod_id, allowed_domains, crm_provider, data_retention_days, encryption_key_id, high_intent_threshold)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (tenant_id) DO UPDATE
        SET tenant_name = EXCLUDED.tenant_name,
            pod_id = EXCLUDED.pod_id,
            allowed_domains = EXCLUDED.allowed_domains,
            crm_provider = EXCLUDED.crm_provider,
            data_retention_days = EXCLUDED.data_retention_days,
            encryption_key_id = EXCLUDED.encryption_key_id,
            high_intent_threshold = EXCLUDED.high_intent_threshold
      `,
      [
        tenant.tenantId,
        tenant.tenantName,
        tenant.podId,
        tenant.allowedDomains,
        tenant.crmProvider,
        tenant.dataRetentionDays,
        tenant.encryptionKeyId,
        tenant.highIntentThreshold,
      ],
    );

    await this.pool.query(
      `
      INSERT INTO funnel_metrics (tenant_id)
      VALUES ($1)
      ON CONFLICT (tenant_id) DO NOTHING
      `,
      [tenant.tenantId],
    );

    return tenant;
  }

  async getTenant(tenantId: string): Promise<TenantConfig | undefined> {
    const res = await this.pool.query(`SELECT * FROM tenants WHERE tenant_id = $1`, [tenantId]);
    if (res.rowCount === 0) {
      return undefined;
    }
    return mapTenant(res.rows[0]);
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

    await this.pool.query(
      `
      INSERT INTO audits (id, tenant_id, action, actor_type, resource_type, resource_id, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [event.id, event.tenantId, event.action, event.actorType, event.resourceType, event.resourceId, event.metadata, event.createdAt],
    );
  }

  async registerSource(source: IngestSource): Promise<IngestSource> {
    await this.pool.query(
      `
      INSERT INTO ingest_sources (tenant_id, source_id, kind, uri, enabled, sync_mode, domain, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (tenant_id, source_id) DO UPDATE
        SET kind = EXCLUDED.kind,
            uri = EXCLUDED.uri,
            enabled = EXCLUDED.enabled,
            sync_mode = EXCLUDED.sync_mode,
            domain = EXCLUDED.domain,
            updated_at = EXCLUDED.updated_at
      `,
      [source.tenantId, source.sourceId, source.kind, source.uri, source.enabled, source.syncMode, source.domain, nowIso()],
    );

    await this.addAudit(source.tenantId, "ingest_source_registered", "ingest_source", source.sourceId, "system", {
      kind: source.kind,
      uri: source.uri,
    });

    return source;
  }

  async listSources(tenantId: string): Promise<IngestSource[]> {
    const res = await this.pool.query(
      `SELECT tenant_id, source_id, kind, uri, enabled, sync_mode, domain FROM ingest_sources WHERE tenant_id = $1`,
      [tenantId],
    );

    return res.rows.map((r: Record<string, unknown>) => ({
      tenantId: String(r.tenant_id),
      sourceId: String(r.source_id),
      kind: r.kind as IngestSource["kind"],
      uri: String(r.uri),
      enabled: Boolean(r.enabled),
      syncMode: r.sync_mode as IngestSource["syncMode"],
      domain: r.domain as IngestSource["domain"],
    }));
  }

  async upsertDocs(tenantId: string, docs: KnowledgeDocument[]): Promise<number> {
    if (docs.length === 0) {
      return 0;
    }
    const embeddingInputs = docs.map((doc) => `${doc.title}\n${doc.content}`);
    const embeddings = await embedTexts(embeddingInputs);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (let idx = 0; idx < docs.length; idx += 1) {
        const doc = docs[idx]!;
        const embedding = vectorToPgLiteral(embeddings[idx]!);
        await client.query(
          `
          INSERT INTO knowledge_documents (id, tenant_id, source_id, title, domain, content, metadata, embedding, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9,$10)
          ON CONFLICT (id) DO UPDATE
            SET source_id = EXCLUDED.source_id,
                title = EXCLUDED.title,
                domain = EXCLUDED.domain,
                content = EXCLUDED.content,
                metadata = EXCLUDED.metadata,
                embedding = EXCLUDED.embedding,
                updated_at = EXCLUDED.updated_at
          `,
          [
            doc.id,
            doc.tenantId,
            doc.sourceId,
            doc.title,
            doc.domain,
            doc.content,
            doc.metadata,
            embedding,
            doc.createdAt,
            doc.updatedAt,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await this.addAudit(tenantId, "docs_upserted", "knowledge_document", tenantId, "system", {
      count: String(docs.length),
    });

    return docs.length;
  }

  async getDocs(tenantId: string): Promise<KnowledgeDocument[]> {
    const res = await this.pool.query(
      `SELECT id, tenant_id, source_id, title, domain, content, metadata, created_at, updated_at FROM knowledge_documents WHERE tenant_id = $1`,
      [tenantId],
    );
    return res.rows.map((r: Record<string, unknown>) => mapDoc(r));
  }

  async getCandidateDocsForQuery(tenantId: string, query: string, topK: number): Promise<KnowledgeDocument[]> {
    const embedding = vectorToPgLiteral(await embedText(query));
    const res = await this.pool.query(
      `
      SELECT id, tenant_id, source_id, title, domain, content, metadata, created_at, updated_at
      FROM knowledge_documents
      WHERE tenant_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3
      `,
      [tenantId, embedding, topK],
    );
    return res.rows.map((r: Record<string, unknown>) => mapDoc(r));
  }

  async createSession(session: ChatSession): Promise<ChatSession> {
    await this.pool.query(
      `
      INSERT INTO chat_sessions (session_id, tenant_id, payload, updated_at)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (session_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
      `,
      [session.sessionId, session.tenantId, session, nowIso()],
    );

    await this.updateFunnel(session.tenantId, { visits: 1, chatsStarted: 1 });

    await this.addAudit(session.tenantId, "chat_session_created", "chat_session", session.sessionId, "visitor", {
      siteId: session.siteId,
      consent: String(session.consentGiven),
    });

    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    const res = await this.pool.query(`SELECT payload FROM chat_sessions WHERE session_id = $1`, [sessionId]);
    if (res.rowCount === 0) {
      return undefined;
    }
    return res.rows[0].payload as ChatSession;
  }

  async updateSession(session: ChatSession): Promise<ChatSession> {
    const res = await this.pool.query(
      `
      UPDATE chat_sessions
      SET payload = $2, updated_at = $3
      WHERE session_id = $1
      `,
      [session.sessionId, session, nowIso()],
    );

    if (res.rowCount === 0) {
      throw new Error(`Session not found for update: ${session.sessionId}`);
    }

    return session;
  }

  async upsertLead(lead: LeadProfile): Promise<LeadProfile> {
    await this.pool.query(
      `
      INSERT INTO leads (session_id, tenant_id, payload, updated_at)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (session_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
      `,
      [lead.sessionId, lead.tenantId, lead, nowIso()],
    );

    await this.addAudit(lead.tenantId, "lead_upserted", "lead_profile", lead.leadId, "system");
    return lead;
  }

  async getLeadBySession(sessionId: string): Promise<LeadProfile | undefined> {
    const res = await this.pool.query(`SELECT payload FROM leads WHERE session_id = $1`, [sessionId]);
    if (res.rowCount === 0) {
      return undefined;
    }
    return res.rows[0].payload as LeadProfile;
  }

  async saveQualification(score: QualificationScore): Promise<QualificationScore> {
    const previous = await this.getQualification(score.sessionId);

    await this.pool.query(
      `
      INSERT INTO qualifications (session_id, tenant_id, payload, updated_at)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (session_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
      `,
      [score.sessionId, score.tenantId, score, nowIso()],
    );

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
    const res = await this.pool.query(`SELECT payload FROM qualifications WHERE session_id = $1`, [sessionId]);
    if (res.rowCount === 0) {
      return undefined;
    }
    return res.rows[0].payload as QualificationScore;
  }

  async saveHandoff(handoff: HandoffEvent): Promise<HandoffEvent> {
    await this.pool.query(
      `
      INSERT INTO handoffs (handoff_id, tenant_id, session_id, payload, updated_at)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (handoff_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
      `,
      [handoff.handoffId, handoff.tenantId, handoff.sessionId, handoff, nowIso()],
    );

    await this.addAudit(handoff.tenantId, "handoff_saved", "handoff_event", handoff.handoffId, "system", {
      status: handoff.status,
    });

    return handoff;
  }

  async getFunnel(tenantId: string): Promise<AnalyticsFunnel> {
    const res = await this.pool.query(`SELECT * FROM funnel_metrics WHERE tenant_id = $1`, [tenantId]);
    if (res.rowCount === 0) {
      return defaultFunnel(tenantId);
    }

    const row = res.rows[0];
    return {
      tenantId: String(row.tenant_id),
      visits: Number(row.visits),
      chatsStarted: Number(row.chats_started),
      qualifiedLeads: Number(row.qualified_leads),
      meetingsBooked: Number(row.meetings_booked),
      bookings: Number(row.bookings),
      ctrToSignup: Number(row.ctr_to_signup),
    };
  }

  async updateFunnel(tenantId: string, delta: FunnelDelta): Promise<AnalyticsFunnel> {
    await this.pool.query(
      `
      INSERT INTO funnel_metrics (tenant_id)
      VALUES ($1)
      ON CONFLICT (tenant_id) DO NOTHING
      `,
      [tenantId],
    );

    await this.pool.query(
      `
      UPDATE funnel_metrics
      SET
        visits = visits + $2,
        chats_started = chats_started + $3,
        qualified_leads = qualified_leads + $4,
        meetings_booked = meetings_booked + $5,
        bookings = bookings + $6,
        ctr_to_signup = CASE WHEN (visits + $2) = 0 THEN 0 ELSE (qualified_leads + $4)::real / (visits + $2)::real END
      WHERE tenant_id = $1
      `,
      [
        tenantId,
        delta.visits ?? 0,
        delta.chatsStarted ?? 0,
        delta.qualifiedLeads ?? 0,
        delta.meetingsBooked ?? 0,
        delta.bookings ?? 0,
      ],
    );

    return this.getFunnel(tenantId);
  }

  async getAudits(tenantId: string): Promise<AuditEvent[]> {
    const res = await this.pool.query(
      `
      SELECT id, tenant_id, action, actor_type, resource_type, resource_id, metadata, created_at
      FROM audits
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1000
      `,
      [tenantId],
    );

    return res.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      tenantId: String(r.tenant_id),
      action: String(r.action),
      actorType: r.actor_type as AuditEvent["actorType"],
      resourceType: String(r.resource_type),
      resourceId: String(r.resource_id),
      metadata: (r.metadata ?? {}) as Record<string, string>,
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));
  }

  async purgeExpiredSessions(tenantId: string, retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const expired = await client.query(
        `SELECT session_id FROM chat_sessions WHERE tenant_id = $1 AND updated_at < $2`,
        [tenantId, cutoff],
      );

      const sessionIds = expired.rows.map((r: Record<string, unknown>) => String(r.session_id));
      if (sessionIds.length === 0) {
        await client.query("COMMIT");
        return 0;
      }

      const placeholders = sessionIds.map((_, i) => `$${i + 1}`).join(",");
      await client.query(`DELETE FROM qualifications WHERE session_id IN (${placeholders})`, sessionIds);
      await client.query(`DELETE FROM leads WHERE session_id IN (${placeholders})`, sessionIds);
      await client.query(`DELETE FROM chat_sessions WHERE session_id IN (${placeholders})`, sessionIds);

      await client.query("COMMIT");

      await this.addAudit(tenantId, "sessions_purged", "chat_session", tenantId, "system", {
        purgedCount: String(sessionIds.length),
        cutoffDate: cutoff,
      });

      return sessionIds.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
