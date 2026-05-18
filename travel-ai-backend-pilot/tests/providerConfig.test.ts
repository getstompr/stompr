import { afterEach, describe, expect, it } from "vitest";
import { createModelRouterFromEnv } from "../src/models/providers.js";

const ENV_KEYS = [
  "MODEL_PRIMARY_PROVIDER",
  "MODEL_PRIMARY_MODEL",
  "MODEL_FALLBACK_PROVIDER",
  "MODEL_FALLBACK_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe("Model provider config", () => {
  it("falls back to local mock providers when configured provider credentials are missing", async () => {
    process.env.MODEL_PRIMARY_PROVIDER = "openai";
    process.env.MODEL_PRIMARY_MODEL = "gpt-4.1";
    delete process.env.OPENAI_API_KEY;
    process.env.MODEL_FALLBACK_PROVIDER = "anthropic";
    process.env.MODEL_FALLBACK_MODEL = "claude-3-5-sonnet-latest";
    delete process.env.ANTHROPIC_API_KEY;

    const router = createModelRouterFromEnv();
    const result = await router.complete({
      system: "test",
      user: "Plan a luxury trip",
      context: ["sample policy context"],
    });

    expect(result.provider).toBe("mock-primary-frontier");
    expect(result.text.length).toBeGreaterThan(0);
  });
});
