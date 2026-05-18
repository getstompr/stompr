import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Lead contact capture", () => {
  it("persists valid contact email and rejects invalid email", async () => {
    const { app } = await buildApp();

    const sessionRes = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "lead_contact_1",
        consentGiven: true,
      },
    });
    expect(sessionRes.statusCode).toBe(201);
    const session = sessionRes.json() as { sessionId: string };

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/lead/contact",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        contactEmail: "not-an-email",
      },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: "POST",
      url: "/v1/lead/contact",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        contactEmail: "traveler@example.com",
      },
    });

    expect(valid.statusCode).toBe(200);
    const body = valid.json() as { ok: boolean; lead: { contactEmail: string } };
    expect(body.ok).toBe(true);
    expect(body.lead.contactEmail).toBe("traveler@example.com");

    await app.close();
  });

  it("requires contact email before escalation", async () => {
    const { app } = await buildApp();

    const sessionRes = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "lead_contact_2",
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
        message: "Luxury honeymoon in Tahiti next year around 30k and ready soon.",
      },
    });

    const escalation = await app.inject({
      method: "POST",
      url: "/v1/handoff/escalate",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        reason: "High-intent lead",
      },
    });

    expect(escalation.statusCode).toBe(400);
    expect(escalation.json()).toMatchObject({
      error: "Missing valid contact email for handoff. Ask traveler for best email and retry.",
    });

    await app.close();
  });
});
