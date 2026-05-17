import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("RAG relevance", () => {
  it("returns cited policy/supplier sources for supplier-rule query", async () => {
    const { app } = await buildApp();

    const sessionRes = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "visitor_1",
        consentGiven: true,
      },
    });

    const session = sessionRes.json() as { sessionId: string };

    const msgRes = await app.inject({
      method: "POST",
      url: "/v1/chat/message",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        message: "What cancellation terms do Aman Maldives offers include?",
      },
    });

    expect(msgRes.statusCode).toBe(200);
    const body = msgRes.json() as { citations: Array<{ domain: string; score: number }> };
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations.some((c) => ["supplier_terms", "agency_policy"].includes(c.domain))).toBe(true);
    expect(body.citations[0].score).toBeGreaterThan(0.25);

    await app.close();
  });
});
