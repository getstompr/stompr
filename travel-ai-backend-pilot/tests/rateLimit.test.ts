import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const originalEnv = {
  RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_EXCLUDE_PATH_PREFIXES: process.env.RATE_LIMIT_EXCLUDE_PATH_PREFIXES,
};

function restoreEnvVar(key: keyof typeof originalEnv): void {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

afterEach(() => {
  restoreEnvVar("RATE_LIMIT_ENABLED");
  restoreEnvVar("RATE_LIMIT_WINDOW_MS");
  restoreEnvVar("RATE_LIMIT_MAX_REQUESTS");
  restoreEnvVar("RATE_LIMIT_EXCLUDE_PATH_PREFIXES");
});

describe("Rate limit middleware", () => {
  it("enforces 429 after threshold when enabled", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_MAX_REQUESTS = "2";
    process.env.RATE_LIMIT_EXCLUDE_PATH_PREFIXES = "/health,/widget/v1.js";

    const { app } = await buildApp();

    const p1 = await app.inject({ method: "GET", url: "/v1/analytics/funnel?tenantId=tenant_luxe_demo", headers: { "x-forwarded-for": "1.2.3.4" } });
    const p2 = await app.inject({ method: "GET", url: "/v1/analytics/funnel?tenantId=tenant_luxe_demo", headers: { "x-forwarded-for": "1.2.3.4" } });
    const p3 = await app.inject({ method: "GET", url: "/v1/analytics/funnel?tenantId=tenant_luxe_demo", headers: { "x-forwarded-for": "1.2.3.4" } });

    expect(p1.statusCode).toBe(200);
    expect(p2.statusCode).toBe(200);
    expect(p3.statusCode).toBe(429);
    expect(p3.json()).toMatchObject({ error: "Rate limit exceeded" });

    await app.close();
  });

  it("does not rate limit excluded paths", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_EXCLUDE_PATH_PREFIXES = "/health,/widget/v1.js";

    const { app } = await buildApp();

    const h1 = await app.inject({ method: "GET", url: "/health", headers: { "x-forwarded-for": "5.6.7.8" } });
    const h2 = await app.inject({ method: "GET", url: "/health", headers: { "x-forwarded-for": "5.6.7.8" } });

    expect(h1.statusCode).toBe(200);
    expect(h2.statusCode).toBe(200);

    await app.close();
  });
});
