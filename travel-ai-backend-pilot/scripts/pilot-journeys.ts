import process from "node:process";

type JourneyCase = {
  name: string;
  message: string;
  minScore: number;
  expectedActions: string[];
};

type SessionResponse = { sessionId: string };
type TokenResponse = { token: string };
type ChatMessageResponse = {
  response?: string;
  citations?: Array<{ title: string; score?: number }>;
  qualification?: { overallScore: number; nextBestAction: string };
};
type EscalateResponse = { crmExternalId?: string };

const baseUrl = (process.env.API_BASE_URL ?? process.argv[2] ?? "").trim().replace(/\/$/, "");
const tenantId = (process.env.SMOKE_TENANT_ID ?? process.argv[3] ?? "tenant_luxe_demo").trim();
const siteId = (process.env.SMOKE_SITE_ID ?? process.argv[4] ?? "luxevoyages.example").trim();
const widgetAdminKey = (process.env.WIDGET_ADMIN_KEY ?? "").trim();

const journeys: JourneyCase[] = [
  {
    name: "honeymoon_luxury",
    message: "We're planning a luxury honeymoon in Japan next year with a 25k budget and can book soon.",
    minScore: 0.6,
    expectedActions: ["show_itineraries", "handoff_agent", "ask_dates"],
  },
  {
    name: "family_summer",
    message: "Family of 5 wants Italy in June around 30k, and we prefer premium family-friendly resorts.",
    minScore: 0.6,
    expectedActions: ["show_itineraries", "handoff_agent", "ask_dates"],
  },
  {
    name: "flexible_destination",
    message: "We are flexible on destination and dates, looking for a curated beach escape with 12k budget.",
    minScore: 0.5,
    expectedActions: ["show_itineraries", "ask_dates", "ask_budget", "handoff_agent"],
  },
];

if (!baseUrl) {
  console.error("Missing API_BASE_URL (or first CLI arg)");
  process.exit(1);
}

if (!widgetAdminKey) {
  console.error("Missing WIDGET_ADMIN_KEY env var");
  process.exit(1);
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: T }> {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const json = (await resp.json()) as T;
  return { ok: resp.ok, status: resp.status, json };
}

async function main(): Promise<void> {
  console.log(`Running pilot journey pack against ${baseUrl} (tenant=${tenantId}, site=${siteId})`);

  const tokenRes = await postJson<TokenResponse>(
    "/v1/widget/token",
    { tenantId, siteId, ttlSeconds: 1800 },
    { "x-widget-admin-key": widgetAdminKey },
  );

  if (!tokenRes.ok || !tokenRes.json.token) {
    console.error("Token issuance failed", tokenRes.status, tokenRes.json);
    process.exit(1);
  }

  const widgetToken = tokenRes.json.token;

  for (const journey of journeys) {
    const sessionRes = await postJson<SessionResponse>("/v1/chat/session", {
      tenantId,
      siteId,
      visitorId: `pilot_${journey.name}_${Date.now()}`,
      consentGiven: true,
      widgetToken,
    });

    if (!sessionRes.ok || !sessionRes.json.sessionId) {
      console.error(`Session bootstrap failed for ${journey.name}`, sessionRes.status, sessionRes.json);
      process.exit(1);
    }

    const messageRes = await postJson<ChatMessageResponse>("/v1/chat/message", {
      tenantId,
      sessionId: sessionRes.json.sessionId,
      message: journey.message,
    });

    if (!messageRes.ok) {
      console.error(`Chat message failed for ${journey.name}`, messageRes.status, messageRes.json);
      process.exit(1);
    }

    const qualification = messageRes.json.qualification;
    const citations = messageRes.json.citations ?? [];
    const nextAction = qualification?.nextBestAction ?? "unknown";
    const score = qualification?.overallScore ?? 0;

    if (!qualification) {
      console.error(`Missing qualification block for ${journey.name}`);
      process.exit(1);
    }

    if (score < journey.minScore) {
      console.error(`Qualification score below threshold for ${journey.name}: ${score} < ${journey.minScore}`);
      process.exit(1);
    }

    if (!journey.expectedActions.includes(nextAction)) {
      console.error(`Unexpected nextBestAction for ${journey.name}: ${nextAction}`);
      process.exit(1);
    }

    if (citations.length === 0) {
      console.error(`No citations returned for ${journey.name}`);
      process.exit(1);
    }

    const contactRes = await postJson<{ ok: boolean }>("/v1/lead/contact", {
      tenantId,
      sessionId: sessionRes.json.sessionId,
      contactEmail: `${journey.name}@example.com`,
    });

    if (!contactRes.ok) {
      console.error(`Lead contact capture failed for ${journey.name}`, contactRes.status, contactRes.json);
      process.exit(1);
    }

    const escalateRes = await postJson<EscalateResponse>("/v1/handoff/escalate", {
      tenantId,
      sessionId: sessionRes.json.sessionId,
      reason: `pilot-journey-${journey.name}`,
    });

    if (!escalateRes.ok || !escalateRes.json.crmExternalId) {
      console.error(`Escalation failed for ${journey.name}`, escalateRes.status, escalateRes.json);
      process.exit(1);
    }

    console.log(`PASS ${journey.name} score=${score.toFixed(3)} action=${nextAction} citations=${citations.length}`);
  }

  console.log("Pilot journey pack passed");
}

main().catch((error) => {
  console.error("Pilot journey pack failed", error);
  process.exit(1);
});
