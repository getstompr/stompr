import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Widget token enforcement", () => {
  it("requires signed token when signing secret is enabled", async () => {
    vi.stubEnv("WIDGET_SIGNING_SECRET", "test_widget_signing_secret");
    vi.stubEnv("WIDGET_ADMIN_KEY", "admin-key-123");

    const { app } = await buildApp();

    const missingHeader = await app.inject({
      method: "POST",
      url: "/v1/widget/token",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
      },
    });
    expect(missingHeader.statusCode).toBe(401);

    const issue = await app.inject({
      method: "POST",
      url: "/v1/widget/token",
      headers: {
        "x-widget-admin-key": "admin-key-123",
      },
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        ttlSeconds: 600,
      },
    });

    expect(issue.statusCode).toBe(201);
    const tokenBody = issue.json() as { token: string };
    expect(tokenBody.token.length).toBeGreaterThan(20);

    const blockedSession = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "v_no_token",
        consentGiven: true,
      },
    });
    expect(blockedSession.statusCode).toBe(401);

    const allowedSession = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "v_with_token",
        consentGiven: true,
        widgetToken: tokenBody.token,
      },
    });

    expect(allowedSession.statusCode).toBe(201);
    const session = allowedSession.json() as { sessionId: string };

    const eventRes = await app.inject({
      method: "POST",
      url: "/v1/widget/event",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        sessionId: session.sessionId,
        widgetToken: tokenBody.token,
        event: "widget_opened",
        metadata: { source: "test" },
      },
    });

    expect(eventRes.statusCode).toBe(202);

    await app.close();
  });
});
