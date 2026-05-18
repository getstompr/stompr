import { randomUUID } from "node:crypto";
import type { PlatformStore } from "../core/platformStore.js";
import type {
  ChatMessageResponse,
  ChatSession,
  CRMTaskPayload,
  HandoffEvent,
  KnowledgeDocument,
  LeadProfile,
  QualificationScore,
  Citation,
} from "../core/types.js";
import { CRMAdapterFactory } from "../integrations/crm.js";
import { ModelRouter } from "../models/providers.js";
import type { AdvantageGraph } from "../rag/advantageGraph.js";
import { retrieveKnowledge } from "../rag/retrieval.js";
import { redactPii } from "../security/pii.js";
import { routeConversationGate } from "./gateRouter.js";
import { buildChatModelPrompt } from "./prompting.js";
import { z } from "zod";

const nowIso = () => new Date().toISOString();
const emailSchema = z.string().email();

function inferBudgetBand(text: string): LeadProfile["budgetBand"] {
  const lc = text.toLowerCase();
  if (lc.match(/\b(50k|50000|60k|70000|80k)\b/)) return "40k_plus";
  if (lc.match(/\b(20k|20000|25k|30k|35k)\b/)) return "15k_40k";
  if (lc.match(/\b(8k|10k|12k|15k|15000)\b/)) return "5k_15k";
  if (lc.match(/\b(2k|3k|4k|4000|5000)\b/)) return "under_5k";
  return "unknown";
}

function inferTripType(text: string): LeadProfile["tripType"] {
  const lc = text.toLowerCase();
  if (lc.includes("honeymoon")) return "honeymoon";
  if (lc.includes("family")) return "family";
  if (lc.includes("group")) return "group";
  if (lc.includes("corporate") || lc.includes("business")) return "corporate";
  if (lc.includes("luxury") || lc.includes("villa") || lc.includes("five-star")) return "luxury_escape";
  return "unknown";
}

function inferTravelWindow(text: string): string {
  const lc = text.toLowerCase();
  if (lc.includes("june") || lc.includes("july") || lc.includes("august")) return "summer";
  if (lc.includes("december") || lc.includes("january") || lc.includes("february")) return "winter";
  if (lc.includes("next month")) return "next_month";
  if (lc.includes("next year")) return "next_year";
  return "unknown";
}

function inferDestinationFlexibility(text: string): LeadProfile["destinationFlexibility"] {
  const lc = text.toLowerCase();
  if (lc.includes("open to") || lc.includes("flexible")) return "high";
  if (lc.includes("must be") || lc.includes("only")) return "low";
  return "medium";
}

function extractEmailCandidate(text: string): string | undefined {
  const match = text.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
  return match?.[0]?.toLowerCase();
}

function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

function computeQualification(lead: LeadProfile): QualificationScore {
  let score = 0.2;
  const reasons: string[] = [];

  if (lead.tripType !== "unknown") {
    score += 0.2;
    reasons.push("Trip type captured");
  }

  if (lead.budgetBand !== "unknown") {
    score += 0.25;
    reasons.push("Budget band known");
  }

  if (lead.travelWindow !== "unknown") {
    score += 0.2;
    reasons.push("Travel window identified");
  }

  if (lead.destinationFlexibility !== "low") {
    score += 0.1;
    reasons.push("Destination flexibility supports planning");
  }

  score += lead.urgencyScore * 0.15;
  score += lead.readinessScore * 0.1;
  score = Math.min(1, score);

  let nextBestAction: QualificationScore["nextBestAction"] = "ask_budget";
  if (lead.budgetBand === "unknown") {
    nextBestAction = "ask_budget";
  } else if (lead.travelWindow === "unknown") {
    nextBestAction = "ask_dates";
  } else if (score >= 0.72) {
    nextBestAction = "handoff_agent";
  } else {
    nextBestAction = "show_itineraries";
  }

  return {
    sessionId: lead.sessionId,
    tenantId: lead.tenantId,
    overallScore: Number(score.toFixed(4)),
    confidence: Number(Math.min(0.95, 0.6 + score * 0.35).toFixed(4)),
    reasons,
    nextBestAction,
    computedAt: nowIso(),
  };
}

function formatBudgetBand(budgetBand: LeadProfile["budgetBand"]): string {
  switch (budgetBand) {
    case "under_5k":
      return "under $5k";
    case "5k_15k":
      return "$5k-$15k";
    case "15k_40k":
      return "$15k-$40k";
    case "40k_plus":
      return "$40k+";
    default:
      return "your preferred budget";
  }
}

function formatTravelWindow(window: string): string {
  if (window === "unknown") return "your target travel window";
  if (window === "next_month") return "next month";
  if (window === "next_year") return "next year";
  return window;
}

function buildAssumptiveHandoffClose(lead: LeadProfile, citations: Citation[], candidateDocs: KnowledgeDocument[]): string {
  const byId = new Map(candidateDocs.map((doc) => [doc.id, doc]));
  const topSources = citations
    .slice(0, 2)
    .map((c) => byId.get(c.documentId)?.metadata.supplier ?? c.title)
    .filter((x): x is string => Boolean(x))
    .slice(0, 2);

  const optionsLine =
    topSources.length >= 2
      ? `I have two strong-fit options from ${topSources[0]} and ${topSources[1]}`
      : topSources.length === 1
        ? `I have a strong-fit option from ${topSources[0]}`
        : "I have two strong-fit options ready";

  const budgetLine = lead.budgetBand === "unknown" ? "" : ` within ${formatBudgetBand(lead.budgetBand)}`;
  const windowLine = lead.travelWindow === "unknown" ? "" : ` for ${formatTravelWindow(lead.travelWindow)}`;
  const urgencyLine =
    lead.urgencyScore >= 0.75
      ? " Availability is tightening, so I want to secure advisor review now."
      : " I can have our senior advisor prioritize this immediately.";

  return `${optionsLine}${budgetLine}${windowLine}.${urgencyLine} I’m bringing in our senior advisor to hold the best-fit plan. What is the best email to send your shortlist to?`;
}

function responseHasEmailCapturePrompt(text: string): boolean {
  const lc = text.toLowerCase();
  return lc.includes("best email") || lc.includes("email address") || lc.includes("send this to");
}

function responseHasInvalidEmailSignal(text: string): boolean {
  const lc = text.toLowerCase();
  return lc.includes("email") && (lc.includes("invalid") || lc.includes("doesn't look right") || lc.includes("double-check"));
}

type RefinementIntent = {
  detected: boolean;
  kind: "price_objection" | "upgrade" | "preference_shift" | "none";
  refinedTerms: string;
};

function detectRefinementIntent(text: string, lead: LeadProfile): RefinementIntent {
  const lc = text.toLowerCase();

  const priceSignals = ["too expensive", "too much", "cheaper", "lower budget", "more affordable", "out of range", "can't afford", "less expensive", "tighter budget"];
  if (priceSignals.some((s) => lc.includes(s))) {
    return { detected: true, kind: "price_objection", refinedTerms: `affordable ${lead.tripType} ${lead.travelWindow} budget-friendly value` };
  }

  const upgradeSignals = ["something nicer", "upgrade", "more luxury", "more exclusive", "top tier", "best you have", "five star", "5 star", "premium", "splurge"];
  if (upgradeSignals.some((s) => lc.includes(s))) {
    return { detected: true, kind: "upgrade", refinedTerms: `ultra-luxury premium exclusive ${lead.tripType} ${lead.travelWindow} top-tier` };
  }

  const prefSignals = ["closer to", "near the beach", "beachfront", "on the water", "mountain", "city", "remote", "secluded", "family-friendly", "adults only", "kid-friendly", "private pool", "overwater"];
  const matchedPref = prefSignals.find((s) => lc.includes(s));
  if (matchedPref) {
    return { detected: true, kind: "preference_shift", refinedTerms: `${matchedPref} ${lead.tripType} ${lead.travelWindow} ${lead.budgetBand}` };
  }

  return { detected: false, kind: "none", refinedTerms: "" };
}

function nextBestCta(
  score: QualificationScore,
  lead: LeadProfile,
  citations: Citation[],
  candidateDocs: KnowledgeDocument[],
): string {
  switch (score.nextBestAction) {
    case "ask_budget":
      return "What budget range should we optimize for so we can shortlist the best options?";
    case "ask_dates":
      return "Share your preferred travel month so we can lock ideal availability windows.";
    case "show_itineraries":
      return "Would you like two curated itinerary concepts now?";
    case "handoff_agent":
      return buildAssumptiveHandoffClose(lead, citations, candidateDocs);
  }
}

function shouldEscalate(score: QualificationScore, threshold: number): { flag: boolean; reason: string } {
  if (score.overallScore >= threshold && score.nextBestAction === "handoff_agent") {
    return { flag: true, reason: "High intent + profile completeness" };
  }

  return { flag: false, reason: "Continue qualification" };
}

function enforceBookingGuardrails(text: string): string {
  const lc = text.toLowerCase();
  if (lc.includes("guaranteed") || lc.includes("locked price") || lc.includes("confirmed booking")) {
    return `${text} Final pricing and inventory require advisor confirmation.`;
  }
  return `${text} Inventory and pricing remain subject to advisor confirmation.`;
}

export class ConversationOrchestrator {
  private static readonly MAX_TRANSCRIPT_ENTRIES = 80;
  private readonly sessionLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly store: PlatformStore,
    private readonly modelRouter: ModelRouter,
    private readonly crmFactory: CRMAdapterFactory,
    private readonly advantageGraph: AdvantageGraph,
  ) {}

  private async withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    let resolve: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.sessionLocks.set(sessionId, next);

    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
      if (this.sessionLocks.get(sessionId) === next) {
        this.sessionLocks.delete(sessionId);
      }
    }
  }

  async createSession(input: { tenantId: string; siteId: string; visitorId: string; consentGiven: boolean }): Promise<ChatSession> {
    const session: ChatSession = {
      sessionId: randomUUID(),
      tenantId: input.tenantId,
      siteId: input.siteId,
      visitorId: input.visitorId,
      consentGiven: input.consentGiven,
      transcript: [],
      lastGate: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    return this.store.createSession(session);
  }

  async qualifyLead(input: Partial<LeadProfile> & { tenantId: string; sessionId: string }): Promise<{ lead: LeadProfile; score: QualificationScore }> {
    const existing = await this.store.getLeadBySession(input.sessionId);
    const lead: LeadProfile = {
      leadId: existing?.leadId ?? randomUUID(),
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      budgetBand: input.budgetBand ?? existing?.budgetBand ?? "unknown",
      travelWindow: input.travelWindow ?? existing?.travelWindow ?? "unknown",
      tripType: input.tripType ?? existing?.tripType ?? "unknown",
      partyProfile: input.partyProfile ?? existing?.partyProfile ?? "unknown",
      destinationFlexibility: input.destinationFlexibility ?? existing?.destinationFlexibility ?? "medium",
      contactEmail: input.contactEmail ?? existing?.contactEmail ?? "",
      readinessScore: input.readinessScore ?? existing?.readinessScore ?? 0,
      urgencyScore: input.urgencyScore ?? existing?.urgencyScore ?? 0,
      profileSummary: input.profileSummary ?? existing?.profileSummary ?? "",
      updatedAt: nowIso(),
    };

    const score = computeQualification(lead);
    await this.store.upsertLead(lead);
    await this.store.saveQualification(score);

    return { lead, score };
  }

  async captureLeadContact(tenantId: string, sessionId: string, contactEmail: string): Promise<LeadProfile> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new Error("Session not found for tenant");
    }

    const normalizedEmail = contactEmail.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      throw new Error("Invalid email format");
    }

    const existing = await this.store.getLeadBySession(sessionId);
    const lead: LeadProfile = {
      leadId: existing?.leadId ?? randomUUID(),
      tenantId,
      sessionId,
      budgetBand: existing?.budgetBand ?? "unknown",
      travelWindow: existing?.travelWindow ?? "unknown",
      tripType: existing?.tripType ?? "unknown",
      partyProfile: existing?.partyProfile ?? "unknown",
      destinationFlexibility: existing?.destinationFlexibility ?? "medium",
      contactEmail: normalizedEmail,
      readinessScore: existing?.readinessScore ?? 0,
      urgencyScore: existing?.urgencyScore ?? 0,
      profileSummary: existing?.profileSummary ?? "",
      updatedAt: nowIso(),
    };

    await this.store.upsertLead(lead);
    await this.store.addAudit(tenantId, "lead_contact_captured", "lead_profile", lead.leadId, "visitor", {
      emailDomain: normalizedEmail.split("@")[1] ?? "unknown",
    });

    return lead;
  }

  async handleMessage(tenantId: string, sessionId: string, message: string): Promise<ChatMessageResponse> {
    return this.withSessionLock(sessionId, () => this._handleMessageInner(tenantId, sessionId, message));
  }

  private async _handleMessageInner(tenantId: string, sessionId: string, message: string): Promise<ChatMessageResponse> {
    const session = await this.store.getSession(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new Error("Session not found for tenant");
    }

    const cleanMsg = redactPii(message);
    const history = [...(session.transcript ?? [])];
    history.push(`visitor:${cleanMsg}`);
    const persistedHistoryAfterVisitor = history.slice(-ConversationOrchestrator.MAX_TRANSCRIPT_ENTRIES);
    const sessionAfterVisitor: ChatSession = {
      ...session,
      transcript: persistedHistoryAfterVisitor,
      updatedAt: nowIso(),
    };
    await this.store.updateSession(sessionAfterVisitor);

    const candidateDocs = await this.store.getCandidateDocsForQuery(tenantId, cleanMsg, 30);
    const citations = retrieveKnowledge(candidateDocs, {
      tenantId,
      query: cleanMsg,
      policyFirst: true,
      topK: 5,
      advantageGraph: this.advantageGraph,
    });

    const leadInput = {
      tenantId,
      sessionId,
      budgetBand: inferBudgetBand(cleanMsg),
      travelWindow: inferTravelWindow(cleanMsg),
      tripType: inferTripType(cleanMsg),
      destinationFlexibility: inferDestinationFlexibility(cleanMsg),
      contactEmail: undefined as string | undefined,
      readinessScore: cleanMsg.length > 60 ? 0.7 : 0.45,
      urgencyScore: cleanMsg.toLowerCase().includes("soon") ? 0.8 : 0.5,
      profileSummary: cleanMsg.slice(0, 220),
    };

    const emailCandidate = extractEmailCandidate(cleanMsg);
    if (emailCandidate && isValidEmail(emailCandidate)) {
      leadInput.contactEmail = emailCandidate;
    }

    const { lead, score } = await this.qualifyLead(leadInput);

    const router = await routeConversationGate({
      latestUserTurn: cleanMsg,
      transcriptHistory: history,
      lead,
      score,
    });

    let finalCitations = citations;
    let finalCandidateDocs = candidateDocs;

    const refinement = detectRefinementIntent(cleanMsg, lead);
    if (refinement.detected && score.overallScore >= 0.5) {
      const refinedDocs = await this.store.getCandidateDocsForQuery(tenantId, refinement.refinedTerms, 20);
      const refinedCitations = retrieveKnowledge(refinedDocs, {
        tenantId,
        query: refinement.refinedTerms,
        policyFirst: false,
        topK: 3,
        advantageGraph: this.advantageGraph,
      });

      const existingIds = new Set(citations.map((c) => c.documentId));
      const newCitations = refinedCitations.filter((c) => !existingIds.has(c.documentId));
      finalCitations = [...citations, ...newCitations].slice(0, 8);

      const existingDocIds = new Set(candidateDocs.map((d) => d.id));
      const newDocs = refinedDocs.filter((d) => !existingDocIds.has(d.id));
      finalCandidateDocs = [...candidateDocs, ...newDocs];

      await this.store.addAudit(tenantId, "refinement_retrieval", "chat_session", sessionId, "system", {
        refinementKind: refinement.kind,
        refinedTerms: refinement.refinedTerms.slice(0, 120),
        newCitationsCount: String(newCitations.length),
      });
    }

    const prompt = buildChatModelPrompt({
      userMessage: cleanMsg,
      lead,
      score,
      citations: finalCitations,
      candidateDocs: finalCandidateDocs,
      transcriptHistory: history,
      router,
    });

    const modelOut = await this.modelRouter.complete({
      system: prompt.system,
      user: prompt.user,
      context: prompt.context,
    });

    let responseText = enforceBookingGuardrails(modelOut.text);

    if (score.nextBestAction === "ask_budget" && lead.budgetBand === "unknown") {
      responseText += " To tailor recommendations, what budget range are you considering?";
    }

    const tenant = await this.store.getTenant(tenantId);
    const escalation = shouldEscalate(score, tenant?.highIntentThreshold ?? 0.72);
    const shouldEscalateFinal = escalation.flag || router.escalation_signal;
    const escalationReason = shouldEscalateFinal
      ? escalation.flag
        ? escalation.reason
        : "Router escalation signal"
      : escalation.reason;

    if (shouldEscalateFinal && !responseHasEmailCapturePrompt(responseText)) {
      responseText += ` ${buildAssumptiveHandoffClose(lead, finalCitations, finalCandidateDocs)}`;
    }

    const rawHasAt = cleanMsg.includes("@");
    const hasInvalidEmailAttempt = rawHasAt && !emailCandidate;
    if (shouldEscalateFinal && hasInvalidEmailAttempt && !responseHasInvalidEmailSignal(responseText)) {
      responseText += " That email doesn't look right yet. Could you re-enter the best email address for your shortlist?";
    }

    history.push(`assistant:${responseText}`);
    const persistedHistoryAfterAssistant = history.slice(-ConversationOrchestrator.MAX_TRANSCRIPT_ENTRIES);

    const previousGate = session.lastGate;
    const updatedSession: ChatSession = {
      ...sessionAfterVisitor,
      transcript: persistedHistoryAfterAssistant,
      lastGate: router.gate,
      updatedAt: nowIso(),
    };
    await this.store.updateSession(updatedSession);

    await this.store.addAudit(tenantId, "chat_message_processed", "chat_session", sessionId, "system", {
      modelProvider: modelOut.provider,
      tokenCostUnit: String(modelOut.normalizedTokens),
      latencyMs: String(modelOut.latencyMs),
      promptGate: prompt.gate,
      routerGate: router.gate,
      routerConfidence: String(router.confidence),
      overrideReason: router.override_reason,
      routerEscalation: String(router.escalation_signal),
      missingSlots: router.missing_slots.join("|"),
      classifierUsed: String(router.classifier_used),
    });

    await this.store.addAudit(tenantId, "gate_router_decision", "chat_session", sessionId, "system", {
      routerGate: router.gate,
      routerConfidence: String(router.confidence),
      overrideReason: router.override_reason,
      routerEscalation: String(router.escalation_signal),
      missingSlots: router.missing_slots.join("|"),
      classifierUsed: String(router.classifier_used),
      nextBestAction: score.nextBestAction,
      qualScore: String(score.overallScore),
    });

    if (previousGate && previousGate !== router.gate) {
      await this.store.addAudit(tenantId, "gate_transition", "chat_session", sessionId, "system", {
        fromGate: previousGate,
        toGate: router.gate,
      });
    }

    return {
      response: responseText,
      citations: finalCitations,
      qualification: score,
      nextBestCta: nextBestCta(score, lead, finalCitations, finalCandidateDocs),
      handoff: {
        shouldEscalate: shouldEscalateFinal,
        reason: shouldEscalateFinal && !lead.contactEmail
          ? `${escalationReason}; awaiting valid contact email`
          : escalationReason,
      },
    };
  }

  async escalate(tenantId: string, sessionId: string, reason: string): Promise<{ handoff: HandoffEvent; crmExternalId: string }> {
    const tenant = await this.store.getTenant(tenantId);
    if (!tenant) {
      throw new Error("Unknown tenant");
    }

    const lead = await this.store.getLeadBySession(sessionId);
    const score = await this.store.getQualification(sessionId);
    if (!lead || !score) {
      throw new Error("Lead and qualification are required before escalation");
    }

    if (!lead.contactEmail || !isValidEmail(lead.contactEmail)) {
      throw new Error("Missing valid contact email for handoff. Ask traveler for best email and retry.");
    }

    const candidateDocs = await this.store.getCandidateDocsForQuery(tenantId, `${lead.tripType} ${lead.travelWindow} ${lead.budgetBand}`, 25);
    const citations = retrieveKnowledge(candidateDocs, {
      tenantId,
      query: `${lead.tripType} ${lead.travelWindow} ${lead.budgetBand}`,
      policyFirst: true,
      topK: 4,
      advantageGraph: this.advantageGraph,
    });

    const session = await this.store.getSession(sessionId);
    const transcript = (session?.transcript ?? []).slice(-6).join("\n");
    const transcriptWithContact = `${transcript}\ncontact_email:${lead.contactEmail}`;
    const handoff: HandoffEvent = {
      handoffId: randomUUID(),
      sessionId,
      tenantId,
      leadId: lead.leadId,
      status: "live",
      reason,
      confidence: score.confidence,
      citations,
      transcriptExcerpt: transcriptWithContact,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const payload: CRMTaskPayload = {
      tenantId,
      crmProvider: tenant.crmProvider,
      lead,
      contactEmail: lead.contactEmail,
      qualification: score,
      suggestedNextAction: "Schedule advisor consult within 2 hours",
      packageShortlist: [`${lead.tripType}_signature_plan`, "premium_curated_option"],
      citedSourceIds: citations.map((c) => c.documentId),
      transcriptExcerpt: transcriptWithContact,
    };

    const adapter = this.crmFactory.forProvider(tenant.crmProvider);
    const result = await adapter.createTask(payload);

    handoff.status = "sent_to_crm";
    handoff.updatedAt = nowIso();
    await this.store.saveHandoff(handoff);

    await this.store.addAudit(tenantId, "crm_task_created", "handoff_event", handoff.handoffId, "system", {
      provider: result.provider,
      taskId: result.externalTaskId,
    });

    return { handoff, crmExternalId: result.externalTaskId };
  }
}
