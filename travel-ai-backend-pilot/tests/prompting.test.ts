import { describe, expect, it } from "vitest";
import { buildChatModelPrompt } from "../src/core/prompting.js";
import type { GateRouterResult } from "../src/core/gateRouter.js";
import type { Citation, KnowledgeDocument, LeadProfile, QualificationScore } from "../src/core/types.js";

function sampleLead(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return {
    leadId: "lead_1",
    tenantId: "tenant_luxe_demo",
    sessionId: "session_1",
    budgetBand: "unknown",
    travelWindow: "unknown",
    tripType: "unknown",
    partyProfile: "unknown",
    destinationFlexibility: "medium",
    readinessScore: 0.5,
    urgencyScore: 0.5,
    profileSummary: "",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function sampleScore(overrides: Partial<QualificationScore> = {}): QualificationScore {
  return {
    sessionId: "session_1",
    tenantId: "tenant_luxe_demo",
    overallScore: 0.55,
    confidence: 0.72,
    reasons: ["Trip type captured"],
    nextBestAction: "ask_budget",
    computedAt: new Date().toISOString(),
    ...overrides,
  };
}

function sampleDocsAndCitations(): { docs: KnowledgeDocument[]; citations: Citation[] } {
  const doc: KnowledgeDocument = {
    id: "doc_1",
    tenantId: "tenant_luxe_demo",
    sourceId: "source_1",
    title: "Tahiti Premium Supplier Terms",
    domain: "supplier_terms",
    content: "Tahiti overwater packages include private transfers and seasonal upgrade windows for luxury clients.",
    metadata: {
      supplier: "PearlResorts",
      destination: "Tahiti",
      packageType: "luxury_escape",
      seasonality: "summer",
      policyClass: "availability",
      piiDetected: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const citation: Citation = {
    documentId: "doc_1",
    title: doc.title,
    domain: doc.domain,
    score: 0.88,
    lastUpdatedAt: doc.updatedAt,
  };

  return { docs: [doc], citations: [citation] };
}

function sampleRouter(overrides: Partial<GateRouterResult> = {}): GateRouterResult {
  return {
    gate: "interest_discovery",
    confidence: 0.82,
    missing_slots: ["budget_band", "travel_window", "trip_type", "party_profile"],
    escalation_signal: false,
    override_reason: "rule:early_interest_discovery",
    classifier_used: false,
    ...overrides,
  };
}

describe("Prompting gates + grounding", () => {
  it("uses routed gate for interest discovery inquiry", () => {
    const { docs, citations } = sampleDocsAndCitations();
    const prompt = buildChatModelPrompt({
      userMessage: "I want to go to Tahiti.",
      lead: sampleLead(),
      score: sampleScore({ nextBestAction: "ask_budget" }),
      citations,
      candidateDocs: docs,
      transcriptHistory: ["visitor:I want to go to Tahiti."],
      router: sampleRouter({ gate: "interest_discovery" }),
    });

    expect(prompt.gate).toBe("interest_discovery");
    expect(prompt.system).toContain("Interest Discovery");
  });

  it("injects grounded source content and metadata into context", () => {
    const { docs, citations } = sampleDocsAndCitations();
    const prompt = buildChatModelPrompt({
      userMessage: "What options do you recommend?",
      lead: sampleLead({ budgetBand: "15k_40k", tripType: "luxury_escape", travelWindow: "summer" }),
      score: sampleScore({ nextBestAction: "show_itineraries", overallScore: 0.74 }),
      citations,
      candidateDocs: docs,
      transcriptHistory: ["visitor:What options do you recommend?"],
      router: sampleRouter({
        gate: "recommend_refine",
        confidence: 0.91,
        missing_slots: [],
        override_reason: "model:routed",
        classifier_used: true,
      }),
    });

    const sourceBlock = prompt.context.find((x) => x.includes("SOURCE 1:")) ?? "";
    expect(sourceBlock).toContain("CONTENT_SNIPPET");
    expect(sourceBlock).toContain("Tahiti overwater packages");
    expect(sourceBlock).toContain("METADATA");

    const routerState = prompt.context.find((x) => x.startsWith("ROUTER_STATE:")) ?? "";
    expect(routerState).toContain("recommend_refine");
  });
});
