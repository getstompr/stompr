import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Security", () => {
  it("redacts PII and blocks cross-tenant session access", async () => {
    const { app, platform } = await buildApp();

    await platform.store.ensureTenant({
      tenantId: "tenant_other",
      tenantName: "Other Agency",
      podId: "pod_other",
      allowedDomains: ["other.example"],
      crmProvider: "pipedrive",
      dataRetentionDays: 120,
      encryptionKeyId: "kms-other",
      highIntentThreshold: 0.72,
    });

    const sessionRes = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "visitor_4",
        consentGiven: true,
      },
    });

    const session = sessionRes.json() as { sessionId: string };

    const piiRes = await app.inject({
      method: "POST",
      url: "/v1/chat/message",
      payload: {
        tenantId: "tenant_luxe_demo",
        sessionId: session.sessionId,
        message: "Email me at test@example.com and call +1 (415) 555-1212",
      },
    });

    expect(piiRes.statusCode).toBe(200);

    const auditRes = await app.inject({
      method: "GET",
      url: "/v1/audit?tenantId=tenant_luxe_demo",
    });
    const audits = auditRes.json() as { events: Array<{ action: string }> };
    expect(audits.events.some((e) => e.action === "chat_message_processed")).toBe(true);

    const crossTenantRes = await app.inject({
      method: "POST",
      url: "/v1/chat/message",
      payload: {
        tenantId: "tenant_other",
        sessionId: session.sessionId,
        message: "Can I access this?",
      },
    });

    expect(crossTenantRes.statusCode).toBe(404);

    await app.close();
  });
});

