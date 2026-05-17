import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import type { LeadProfile, QualificationScore } from "./types.js";
import type { ConversationGate } from "./prompting.js";

export type MissingSlot =
  | "budget_band"
  | "travel_window"
  | "trip_type"
  | "party_profile";

export type GateRouterResult = {
  gate: ConversationGate;
  confidence: number;
  missing_slots: MissingSlot[];
  escalation_signal: boolean;
  override_reason: string;
  classifier_used: boolean;
};

type GateRouterInput = {
  latestUserTurn: string;
  transcriptHistory: string[];
  lead: LeadProfile;
  score: QualificationScore;
};

const classifierOutputSchema = z.object({
  gate: z.enum(["interest_discovery", "qualification", "recommend_refine", "concierge_handoff"]),
  confidence: z.number().min(0).max(1),
  escalation_signal: z.boolean().optional(),
  reason: z.string().optional(),
});

type ClassifierOutput = z.infer<typeof classifierOutputSchema>;

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function detectMissingSlots(lead: LeadProfile): MissingSlot[] {
  const missing: MissingSlot[] = [];
  if (lead.budgetBand === "unknown") missing.push("budget_band");
  if (lead.travelWindow === "unknown") missing.push("travel_window");
  if (lead.tripType === "unknown") missing.push("trip_type");
  if (!lead.partyProfile || lead.partyProfile === "unknown") missing.push("party_profile");
  return missing;
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function stageARules(input: GateRouterInput, missingSlots: MissingSlot[]): GateRouterResult | null {
  const lc = input.latestUserTurn.toLowerCase();

  const explicitAgent =
    containsAny(lc, [/\bagent\b/, /\badvisor\b/, /\bhuman\b/, /\bconcierge\b/]) &&
    containsAny(lc, [/\btalk\b/, /\bspeak\b/, /\bconnect\b/, /\bhandoff\b/, /\bcall\b/, /\bbook\b/]);

  if (explicitAgent) {
    return {
      gate: "concierge_handoff",
      confidence: 0.98,
      missing_slots: missingSlots,
      escalation_signal: true,
      override_reason: "rule:explicit_agent_request",
      classifier_used: false,
    };
  }

  if (containsAny(lc, [/guaranteed/, /locked\s*price/, /confirm(?:ed)?\s*booking/])) {
    return {
      gate: "qualification",
      confidence: 0.94,
      missing_slots: missingSlots,
      escalation_signal: false,
      override_reason: "rule:safety_booking_commitment",
      classifier_used: false,
    };
  }

  if (missingSlots.includes("budget_band") || missingSlots.includes("travel_window")) {
    return {
      gate: "qualification",
      confidence: 0.9,
      missing_slots: missingSlots,
      escalation_signal: false,
      override_reason: "rule:missing_core_slots",
      classifier_used: false,
    };
  }

  if (input.score.nextBestAction === "handoff_agent" && input.score.overallScore >= 0.72) {
    return {
      gate: "concierge_handoff",
      confidence: 0.89,
      missing_slots: missingSlots,
      escalation_signal: true,
      override_reason: "rule:score_based_handoff",
      classifier_used: false,
    };
  }

  if (input.transcriptHistory.length <= 1 && missingSlots.length >= 2) {
    return {
      gate: "interest_discovery",
      confidence: 0.82,
      missing_slots: missingSlots,
      escalation_signal: false,
      override_reason: "rule:early_interest_discovery",
      classifier_used: false,
    };
  }

  return null;
}

function classifierPrompt(input: GateRouterInput, missingSlots: MissingSlot[]): string {
  const transcript = input.transcriptHistory.slice(-6).join("\n");
  return [
    "Return JSON only.",
    "Classify next gate for a travel sales assistant funnel.",
    "Allowed gates: interest_discovery, qualification, recommend_refine, concierge_handoff.",
    "Prefer qualification if uncertain.",
    "Input:",
    JSON.stringify(
      {
        latestUserTurn: input.latestUserTurn,
        recentTranscript: transcript,
        lead: {
          budgetBand: input.lead.budgetBand,
          travelWindow: input.lead.travelWindow,
          tripType: input.lead.tripType,
          partyProfile: input.lead.partyProfile,
          destinationFlexibility: input.lead.destinationFlexibility,
        },
        qualification: {
          overallScore: input.score.overallScore,
          nextBestAction: input.score.nextBestAction,
        },
        missingSlots,
      },
      null,
      2,
    ),
    "Output schema:",
    '{"gate":"qualification","confidence":0.75,"escalation_signal":false,"reason":"short reason"}',
  ].join("\n");
}

async function classifyWithOpenAI(prompt: string): Promise<ClassifierOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("OPENAI_API_KEY missing");
  }

  const model = (process.env.GATE_ROUTER_CLASSIFIER_MODEL || "gpt-4.1-mini").trim();
  const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 180,
    messages: [
      {
        role: "system",
        content: "You are a strict JSON classifier. Respond with JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const parsed = JSON.parse(raw);
  return classifierOutputSchema.parse(parsed);
}

async function classifyWithAnthropic(prompt: string): Promise<ClassifierOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("ANTHROPIC_API_KEY missing");
  }

  const model = (process.env.GATE_ROUTER_CLASSIFIER_MODEL || "claude-3-5-haiku-latest").trim();
  const client = new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL });

  const completion = await client.messages.create({
    model,
    max_tokens: 220,
    temperature: 0,
    system: "You are a strict JSON classifier. Respond with JSON only.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const parsed = JSON.parse(raw);
  return classifierOutputSchema.parse(parsed);
}

async function stageBClassifier(input: GateRouterInput, missingSlots: MissingSlot[]): Promise<GateRouterResult> {
  const enabled = parseBool(process.env.GATE_ROUTER_CLASSIFIER_ENABLED, false);
  if (!enabled) {
    return {
      gate: "qualification",
      confidence: 0.55,
      missing_slots: missingSlots,
      escalation_signal: false,
      override_reason: "fallback:classifier_disabled",
      classifier_used: false,
    };
  }

  const provider = (process.env.GATE_ROUTER_CLASSIFIER_PROVIDER || "openai").toLowerCase();
  const prompt = classifierPrompt(input, missingSlots);

  try {
    const result =
      provider === "anthropic"
        ? await classifyWithAnthropic(prompt)
        : await classifyWithOpenAI(prompt);

    if (result.confidence < 0.65) {
      return {
        gate: "qualification",
        confidence: normalizeConfidence(result.confidence),
        missing_slots: missingSlots,
        escalation_signal: false,
        override_reason: "fallback:low_classifier_confidence",
        classifier_used: true,
      };
    }

    return {
      gate: result.gate,
      confidence: normalizeConfidence(result.confidence),
      missing_slots: missingSlots,
      escalation_signal: Boolean(result.escalation_signal) || result.gate === "concierge_handoff",
      override_reason: result.reason ? `model:${result.reason}` : "model:routed",
      classifier_used: true,
    };
  } catch {
    return {
      gate: "qualification",
      confidence: 0.5,
      missing_slots: missingSlots,
      escalation_signal: false,
      override_reason: "fallback:classifier_error",
      classifier_used: true,
    };
  }
}

export async function routeConversationGate(input: GateRouterInput): Promise<GateRouterResult> {
  const missingSlots = detectMissingSlots(input.lead);

  const rule = stageARules(input, missingSlots);
  if (rule) {
    return rule;
  }

  return stageBClassifier(input, missingSlots);
}
