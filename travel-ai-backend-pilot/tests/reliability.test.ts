import { describe, expect, it } from "vitest";
import { ModelRouter, type ModelPrompt, type ModelProvider } from "../src/models/providers.js";
import { buildApp } from "../src/app.js";

class FailingPrimary implements ModelProvider {
  name = "failing-primary";
  async complete(_prompt: ModelPrompt) {
    throw new Error("simulated failure");
  }
}

class StableFallback implements ModelProvider {
  name = "stable-fallback";
  async complete(_prompt: ModelPrompt) {
    return {
      provider: this.name,
      text: "fallback ok",
      latencyMs: 1,
      normalizedTokens: 3,
    };
  }
}

describe("Reliability", () => {
  it("falls back to secondary model provider", async () => {
    const router = new ModelRouter(new FailingPrimary(), new StableFallback());
    const result = await router.complete({ system: "x", user: "y", context: [] });
    expect(result.provider).toBe("stable-fallback");
    expect(result.text).toContain("fallback");
  });

  it("returns 404 for missing ingest source and remains healthy", async () => {
    const { app } = await buildApp();
    const runRes = await app.inject({
      method: "POST",
      url: "/v1/ingest/run",
      payload: {
        tenantId: "tenant_luxe_demo",
        sourceId: "missing_source",
      },
    });

    expect(runRes.statusCode).toBe(404);

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    await app.close();
  });
});
