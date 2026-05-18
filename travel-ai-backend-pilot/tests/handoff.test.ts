import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Handoff", () => {
  it("creates live escalation and CRM payload", async () => {
    const { app } = await buildApp();

    const sessionRes = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "visitor_3",
        consentGiven: true,
      },
    });
    const session = sessionRes.json() as { sessionId: string };

    await app.inject({
      method: "POST",
      url: "/v1/chat/message",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        message: "Luxury family Italy trip in June with 30k budget, ready to book soon.",
      },
    });

    const contact = await app.inject({
      method: "POST",
      url: "/v1/lead/contact",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        contactEmail: "family.traveler@example.com",
      },
    });
    expect(contact.statusCode).toBe(200);

    const escalation = await app.inject({
      method: "POST",
      url: "/v1/handoff/escalate",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        reason: "High-intent lead",
      },
    });

    expect(escalation.statusCode).toBe(201);
    const body = escalation.json() as { handoff: { status: string; citations: unknown[] }; crmExternalId: string };
    expect(body.handoff.status).toBe("sent_to_crm");
    expect(body.crmExternalId.length).toBeGreaterThan(5);
    expect(body.handoff.citations.length).toBeGreaterThan(0);

    await app.close();
  });
});
