import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Widget deployability", () => {
  it("serves the deployable widget bootstrap script", async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: "GET", url: "/widget/v1.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/javascript");
    expect(res.body).toContain("window.TravelAIWidget");

    await app.close();
  });

  it("enforces tenant domain allow-list on session creation", async () => {
    const { app } = await buildApp();

    const blocked = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "unapproved-site.example",
        visitorId: "visitor_9",
        consentGiven: true,
      },
    });
    expect(blocked.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "POST",
      url: "/v1/chat/session",
      payload: {
        tenantId: "tenant_luxe_demo",
        siteId: "luxevoyages.example",
        visitorId: "visitor_10",
        consentGiven: true,
      },
    });
    expect(allowed.statusCode).toBe(201);

    await app.close();
  });
});
