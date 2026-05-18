import { z } from "zod";

export const knowledgeDomainSchema = z.enum([
  "public_marketing",
  "client_private_offers",
  "agency_policy",
  "supplier_terms",
]);

export type KnowledgeDomain = z.infer<typeof knowledgeDomainSchema>;

export const crmProviderSchema = z.enum(["hubspot", "salesforce", "pipedrive"]);
export type CRMProvider = z.infer<typeof crmProviderSchema>;

export const tenantConfigSchema = z.object({
  tenantId: z.string().min(2),
  tenantName: z.string().min(2),
  podId: z.string().min(2),
  allowedDomains: z.array(z.string()).default([]),
  crmProvider: crmProviderSchema,
  dataRetentionDays: z.number().int().positive().default(365),
  encryptionKeyId: z.string().min(2),
  highIntentThreshold: z.number().min(0).max(1).default(0.72),
});
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export const citationSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  domain: knowledgeDomainSchema,
  score: z.number().min(0).max(1),
  lastUpdatedAt: z.string(),
  imageUrl: z.string().url().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

export const knowledgeDocumentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  sourceId: z.string(),
  title: z.string(),
  domain: knowledgeDomainSchema,
  content: z.string(),
  metadata: z.object({
    supplier: z.string().optional(),
    destination: z.string().optional(),
    packageType: z.string().optional(),
    seasonality: z.string().optional(),
    policyClass: z.string().optional(),
    imageUrl: z.string().url().optional(),
    heroImage: z.string().url().optional(),
    piiDetected: z.boolean().default(false),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const ingestSourceSchema = z.object({
  sourceId: z.string(),
  tenantId: z.string(),
  kind: z.enum(["website", "pdf", "drive", "sharepoint", "csv", "crm_export"]),
  uri: z.string(),
  enabled: z.boolean().default(true),
  syncMode: z.enum(["event", "nightly", "manual_priority"]).default("nightly"),
  domain: knowledgeDomainSchema,
});
export type IngestSource = z.infer<typeof ingestSourceSchema>;

export const chatSessionSchema = z.object({
  sessionId: z.string(),
  tenantId: z.string(),
  siteId: z.string(),
  visitorId: z.string(),
  consentGiven: z.boolean(),
  transcript: z.array(z.string()).default([]),
  lastGate: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

export const leadProfileSchema = z.object({
  leadId: z.string(),
  sessionId: z.string(),
  tenantId: z.string(),
  budgetBand: z.enum(["unknown", "under_5k", "5k_15k", "15k_40k", "40k_plus"]),
  travelWindow: z.string().default("unknown"),
  tripType: z.enum(["unknown", "honeymoon", "family", "luxury_escape", "group", "corporate"]),
  partyProfile: z.string().default("unknown"),
  destinationFlexibility: z.enum(["low", "medium", "high"]).default("medium"),
  contactEmail: z.union([z.string().email(), z.literal("")]).default(""),
  readinessScore: z.number().min(0).max(1).default(0),
  urgencyScore: z.number().min(0).max(1).default(0),
  profileSummary: z.string().default(""),
  updatedAt: z.string(),
});
export type LeadProfile = z.infer<typeof leadProfileSchema>;

export const qualificationScoreSchema = z.object({
  sessionId: z.string(),
  tenantId: z.string(),
  overallScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  nextBestAction: z.enum(["ask_budget", "ask_dates", "show_itineraries", "handoff_agent"]),
  computedAt: z.string(),
});
export type QualificationScore = z.infer<typeof qualificationScoreSchema>;

export const handoffEventSchema = z.object({
  handoffId: z.string(),
  sessionId: z.string(),
  tenantId: z.string(),
  leadId: z.string(),
  status: z.enum(["queued", "live", "approved", "sent_to_crm"]),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  citations: z.array(citationSchema),
  transcriptExcerpt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HandoffEvent = z.infer<typeof handoffEventSchema>;

export const crmTaskPayloadSchema = z.object({
  tenantId: z.string(),
  crmProvider: crmProviderSchema,
  lead: leadProfileSchema,
  contactEmail: z.union([z.string().email(), z.literal("")]).default(""),
  qualification: qualificationScoreSchema,
  suggestedNextAction: z.string(),
  packageShortlist: z.array(z.string()),
  citedSourceIds: z.array(z.string()),
  transcriptExcerpt: z.string(),
});
export type CRMTaskPayload = z.infer<typeof crmTaskPayloadSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  action: z.string(),
  actorType: z.enum(["system", "visitor", "agent"]),
  resourceType: z.string(),
  resourceId: z.string(),
  metadata: z.record(z.string(), z.string()).default({}),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const chatMessageRequestSchema = z.object({
  tenantId: z.string(),
  sessionId: z.string(),
  message: z.string().min(1),
});

export const chatMessageResponseSchema = z.object({
  response: z.string(),
  citations: z.array(citationSchema),
  qualification: qualificationScoreSchema,
  nextBestCta: z.string(),
  handoff: z.object({
    shouldEscalate: z.boolean(),
    reason: z.string(),
  }),
});

export type ChatMessageResponse = z.infer<typeof chatMessageResponseSchema>;

export const analyticsFunnelSchema = z.object({
  tenantId: z.string(),
  visits: z.number().int().nonnegative(),
  chatsStarted: z.number().int().nonnegative(),
  qualifiedLeads: z.number().int().nonnegative(),
  meetingsBooked: z.number().int().nonnegative(),
  bookings: z.number().int().nonnegative(),
  ctrToSignup: z.number().min(0),
});
export type AnalyticsFunnel = z.infer<typeof analyticsFunnelSchema>;
