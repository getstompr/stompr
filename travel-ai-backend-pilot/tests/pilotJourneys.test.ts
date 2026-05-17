import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

type JourneyCase = {
  name: string;
  message: string;
  minScore: number;
  expectedActions: string[];
};

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

describe("Pilot journey pack", () => {
  it("validates honeymoon/family/flexible scripted flows", async () => {
    const { app } = await buildApp();

    for (const journey of journeys) {
      const sessionRes = await app.inject({
        method: "POST",
        url: "/v1/chat/session",
        payload: {
          tenantId: "tenant_luxe_demo",
          siteId: "luxevoyages.example",
          visitorId: `pilot_${journey.name}`,
          consentGiven: true,
        },
      });

      expect(sessionRes.statusCode).toBe(201);
      const session = sessionRes.json() as { sessionId: string };

      const msgRes = await app.inject({
        method: "POST",
        url: "/v1/chat/message",
        payload: {
          tenantId: "tenant_luxe_demo",
          sessionId: session.sessionId,
          message: journey.message,
        },
      });

      expect(msgRes.statusCode).toBe(200);
      const msgBody = msgRes.json() as {
        citations: unknown[];
        qualification: { overallScore: number; nextBestAction: string };
      };

      expect(msgBody.citations.length).toBeGreaterThan(0);
      expect(msgBody.qualification.overallScore).toBeGreaterThanOrEqual(journey.minScore);
      expect(journey.expectedActions).toContain(msgBody.qualification.nextBestAction);

      const contactRes = await app.inject({
        method: "POST",
        url: "/v1/lead/contact",
        payload: {
          tenantId: "tenant_luxe_demo",
          sessionId: session.sessionId,
          contactEmail: `${journey.name}@example.com`,
        },
      });
      expect(contactRes.statusCode).toBe(200);

      const escalateRes = await app.inject({
        method: "POST",
        url: "/v1/handoff/escalate",
        payload: {
          tenantId: "tenant_luxe_demo",
          sessionId: session.sessionId,
          reason: `pilot-journey-${journey.name}`,
        },
      });

      expect(escalateRes.statusCode).toBe(201);
      const escalateBody = escalateRes.json() as { crmExternalId: string };
      expect(escalateBody.crmExternalId.length).toBeGreaterThan(5);
    }

    await app.close();
  });
});
