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

export type FunnelDelta = {
  visits?: number;
  chatsStarted?: number;
  qualifiedLeads?: number;
  meetingsBooked?: number;
  bookings?: number;
};

export interface PlatformStore {
  ensureTenant(tenant: TenantConfig): Promise<TenantConfig>;
  getTenant(tenantId: string): Promise<TenantConfig | undefined>;

  addAudit(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    actorType: AuditEvent["actorType"],
    metadata?: Record<string, string>,
  ): Promise<void>;

  registerSource(source: IngestSource): Promise<IngestSource>;
  listSources(tenantId: string): Promise<IngestSource[]>;

  upsertDocs(tenantId: string, docs: KnowledgeDocument[]): Promise<number>;
  getDocs(tenantId: string): Promise<KnowledgeDocument[]>;
  getCandidateDocsForQuery(tenantId: string, query: string, topK: number): Promise<KnowledgeDocument[]>;

  createSession(session: ChatSession): Promise<ChatSession>;
  getSession(sessionId: string): Promise<ChatSession | undefined>;
  updateSession(session: ChatSession): Promise<ChatSession>;

  upsertLead(lead: LeadProfile): Promise<LeadProfile>;
  getLeadBySession(sessionId: string): Promise<LeadProfile | undefined>;

  saveQualification(score: QualificationScore): Promise<QualificationScore>;
  getQualification(sessionId: string): Promise<QualificationScore | undefined>;

  saveHandoff(handoff: HandoffEvent): Promise<HandoffEvent>;

  getFunnel(tenantId: string): Promise<AnalyticsFunnel>;
  updateFunnel(tenantId: string, delta: FunnelDelta): Promise<AnalyticsFunnel>;

  getAudits(tenantId: string): Promise<AuditEvent[]>;

  purgeExpiredSessions(tenantId: string, retentionDays: number): Promise<number>;
}
