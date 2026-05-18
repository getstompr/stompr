import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Conversion flow", () => {
  it("qualifies a luxury honeymoon lead and returns CTA", async () => {
    const { app } = await buildApp();

    const sessionRes = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "visitor_2",
        consentGiven: true,
      },
    });

    const session = sessionRes.json() as { sessionId: string };

    const message = "We need a luxury honeymoon in Japan next year around 25k and can travel soon if needed.";
    const msgRes = await app.inject({
      method: "POST",
      url: "/v1/chat/message",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        message,
      },
    });

    expect(msgRes.statusCode).toBe(200);
    const body = msgRes.json() as {
      response: string;
      qualification: { overallScore: number; nextBestAction: string };
      nextBestCta: string;
      handoff: { shouldEscalate: boolean };
    };

    expect(body.qualification.overallScore).toBeGreaterThan(0.6);
    expect(["handoff_agent", "show_itineraries", "ask_dates"]).toContain(body.qualification.nextBestAction);
    expect(body.nextBestCta.length).toBeGreaterThan(10);

    if (body.qualification.nextBestAction === "handoff_agent" || body.handoff.shouldEscalate) {
      expect(body.nextBestCta.toLowerCase()).toContain("best email");
      expect(body.response.toLowerCase()).toContain("best email");
    }

    await app.close();
  });
});
