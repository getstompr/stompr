import { describe, expect, it } from "vitest";
import { WidgetTokenService } from "../src/security/widgetToken.js";

describe("WidgetTokenService", () => {
  it("issues and verifies token for tenant/site", () => {
    const svc = new WidgetTokenService("secret_123");
    const token = svc.issueToken({
      tenantId: "tenant_luxe_demo",
      siteId: "luxevoyages.example",
      ttlSeconds: 300,
      jti: "abc123xyz",
      nowMs: 1_700_000_000_000,
    });

    const verified = svc.verifyToken(token, {
      tenantId: "tenant_luxe_demo",
      siteId: "luxevoyages.example",
      nowMs: 1_700_000_100_000,
    });

    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.claims.tenantId).toBe("tenant_luxe_demo");
      expect(verified.claims.siteId).toBe("luxevoyages.example");
    }
  });

  it("rejects mismatched site", () => {
    const svc = new WidgetTokenService("secret_123");
    const token = svc.issueToken({
      tenantId: "tenant_luxe_demo",
      siteId: "luxevoyages.example",
      ttlSeconds: 300,
      jti: "mismatch_test",
    });

    const verified = svc.verifyToken(token, {
      tenantId: "tenant_luxe_demo",
      siteId: "evil.example",
    });

    expect(verified.valid).toBe(false);
  });
});
