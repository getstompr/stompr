import { afterEach, describe, expect, it } from "vitest";
import { routeConversationGate } from "../src/core/gateRouter.js";
import type { LeadProfile, QualificationScore } from "../src/core/types.js";

const originalEnv = {
  GATE_ROUTER_CLASSIFIER_ENABLED: process.env.GATE_ROUTER_CLASSIFIER_ENABLED,
};

function restoreEnvVar(key: keyof typeof originalEnv): void {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

afterEach(() => {
  restoreEnvVar("GATE_ROUTER_CLASSIFIER_ENABLED");
});

function sampleLead(overrides: Partial<LeadProfile> = {}): LeadProfile {
  return {
    leadId: "lead_1",
    sessionId: "session_1",
    tenantId: "tenant_luxe_demo",
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
    overallScore: 0.5,
    confidence: 0.7,
    reasons: ["Trip type captured"],
    nextBestAction: "ask_budget",
    computedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Gate router", () => {
  it("prevents recommending too early when core slots are missing", async () => {
    const result = await routeConversationGate({
      latestUserTurn: "Tahiti sounds great, what do you suggest?",
      transcriptHistory: ["visitor:Tahiti sounds great, what do you suggest?"],
      lead: sampleLead({ budgetBand: "unknown", travelWindow: "unknown" }),
      score: sampleScore({ nextBestAction: "show_itineraries" }),
    });

    expect(result.gate).toBe("qualification");
    expect(result.override_reason).toContain("missing_core_slots");
    expect(result.missing_slots).toContain("budget_band");
    expect(result.missing_slots).toContain("travel_window");
  });

  it("avoids over-handoff when user has not requested agent and score is low", async () => {
    process.env.GATE_ROUTER_CLASSIFIER_ENABLED = "false";

    const result = await routeConversationGate({
      latestUserTurn: "I am browsing ideas and not ready to connect yet.",
      transcriptHistory: ["visitor:I am browsing ideas and not ready to connect yet."],
      lead: sampleLead({ budgetBand: "15k_40k", travelWindow: "summer", tripType: "luxury_escape", partyProfile: "couple" }),
      score: sampleScore({ overallScore: 0.58, nextBestAction: "show_itineraries" }),
    });

    expect(result.gate).not.toBe("concierge_handoff");
    expect(result.escalation_signal).toBe(false);
  });

  it("triggers concierge handoff for explicit agent request", async () => {
    const result = await routeConversationGate({
      latestUserTurn: "Can I speak to a human advisor now?",
      transcriptHistory: ["visitor:Can I speak to a human advisor now?"],
      lead: sampleLead({ budgetBand: "15k_40k", travelWindow: "summer", tripType: "luxury_escape" }),
      score: sampleScore({ overallScore: 0.8, nextBestAction: "handoff_agent" }),
    });

    expect(result.gate).toBe("concierge_handoff");
    expect(result.escalation_signal).toBe(true);
    expect(result.override_reason).toContain("explicit_agent_request");
  });
});
