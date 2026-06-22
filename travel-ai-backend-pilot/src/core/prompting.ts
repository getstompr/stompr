import type { Citation, KnowledgeDocument, LeadProfile, QualificationScore } from "./types.js";
import type { GateRouterResult } from "./gateRouter.js";

export type ConversationGate = "interest_discovery" | "qualification" | "recommend_refine" | "concierge_handoff";

type BuildPromptInputArgs = {
  userMessage: string;
  lead: LeadProfile;
  score: QualificationScore;
  citations: Citation[];
  candidateDocs: KnowledgeDocument[];
  transcriptHistory: string[];
  router: GateRouterResult;
};

function oneLine(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}...`;
}

function gateSpecificInstructions(gate: ConversationGate): string {
  switch (gate) {
    case "interest_discovery":
      return [
        "Gate: Interest Discovery.",
        "Acknowledge destination interest and build confidence quickly.",
        "Ask exactly one high-value discovery question focused on what matters most to the traveler.",
        "Do not provide full recommendation sets yet.",
      ].join(" ");
    case "qualification":
      return [
        "Gate: Qualification.",
        "Collect missing fields efficiently: budget band, travel window, trip type, party profile.",
        "Ask concise targeted questions and avoid broad brainstorming.",
        "If one core slot is missing, prioritize that slot first.",
      ].join(" ");
    case "recommend_refine":
      return [
        "Gate: Recommend and Refine.",
        "Provide 2-3 grounded options using retrieved sources and briefly explain tradeoffs.",
        "Rotate options based on user feedback and ask one refinement question.",
        "Do not imply booking is finalized.",
      ].join(" ");
    case "concierge_handoff":
      return [
        "Gate: Concierge Handoff.",
        "Summarize fit and intent in a premium concierge tone.",
        "Use an assumptive close that confidently progresses to advisor handoff.",
        "Ask for best email to deliver shortlist and hold priority options.",
        "Reinforce advisor confirmation for inventory and pricing.",
      ].join(" ");
  }
}

function buildSourceContext(citations: Citation[], candidateDocs: KnowledgeDocument[]): string[] {
  const byId = new Map(candidateDocs.map((doc) => [doc.id, doc]));

  return citations.map((citation, index) => {
    const doc = byId.get(citation.documentId);
    if (!doc) {
      return [
        `SOURCE ${index + 1}: ${citation.title}`,
        `DOMAIN: ${citation.domain}`,
        `RETRIEVAL_SCORE: ${citation.score}`,
        "CONTENT_SNIPPET: source body unavailable in this payload.",
      ].join("\n");
    }

    const metadata = {
      supplier: doc.metadata.supplier ?? "unknown",
      destination: doc.metadata.destination ?? "unknown",
      packageType: doc.metadata.packageType ?? "unknown",
      seasonality: doc.metadata.seasonality ?? "unknown",
      policyClass: doc.metadata.policyClass ?? "unknown",
    };

    return [
      `SOURCE ${index + 1}: ${citation.title}`,
      `DOMAIN: ${citation.domain}`,
      `RETRIEVAL_SCORE: ${citation.score}`,
      `UPDATED_AT: ${citation.lastUpdatedAt}`,
      `METADATA: ${JSON.stringify(metadata)}`,
      `CONTENT_SNIPPET: ${clip(oneLine(doc.content), 900)}`,
    ].join("\n");
  });
}

export function buildChatModelPrompt(args: BuildPromptInputArgs): {
  system: string;
  user: string;
  context: string[];
  gate: ConversationGate;
} {
  const gate = args.router.gate;
  const missingSlots = args.router.missing_slots;

  const system = [
    "You are a luxury travel pre-sales assistant for a premium agency.",
    "Primary objective: increase qualified lead quality and route qualified travelers to advisor handoff.",
    "Hard rules: never invent supplier terms, policy details, inventory, or final prices.",
    "When evidence is weak or conflicting, state uncertainty and ask a precise clarifying question.",
    "Use retrieved sources as truth; prioritize agency policy and supplier terms over marketing language.",
    gateSpecificInstructions(gate),
  ].join(" ");

  const transcriptExcerpt = args.transcriptHistory.slice(-6).join("\n");
  const sourceContext = buildSourceContext(args.citations, args.candidateDocs);

  const context = [
    `CURRENT_GATE: ${gate}`,
    `ROUTER_STATE: ${JSON.stringify({
      gate: args.router.gate,
      confidence: args.router.confidence,
      missing_slots: missingSlots,
      escalation_signal: args.router.escalation_signal,
      override_reason: args.router.override_reason,
      classifier_used: args.router.classifier_used,
    })}`,
    `STATE_SUMMARY: ${JSON.stringify({
      known_slots: {
        budgetBand: args.lead.budgetBand,
        travelWindow: args.lead.travelWindow,
        tripType: args.lead.tripType,
        partyProfile: args.lead.partyProfile,
        destinationFlexibility: args.lead.destinationFlexibility,
      },
      missing_slots: missingSlots,
    })}`,
    `QUALIFICATION: ${JSON.stringify({
      overallScore: args.score.overallScore,
      confidence: args.score.confidence,
      reasons: args.score.reasons,
      nextBestAction: args.score.nextBestAction,
    })}`,
    transcriptExcerpt ? `RECENT_TRANSCRIPT:\n${transcriptExcerpt}` : "RECENT_TRANSCRIPT: none",
    ...sourceContext,
  ];

  return {
    system,
    user: args.userMessage,
    context,
    gate,
  };
}
