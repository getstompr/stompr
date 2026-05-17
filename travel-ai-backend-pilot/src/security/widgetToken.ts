import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const headerSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("WJT"),
});

const claimsSchema = z.object({
  tenantId: z.string().min(1),
  siteId: z.string().min(1),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(6),
});

export type WidgetTokenClaims = z.infer<typeof claimsSchema>;

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = `${input}${"=".repeat(padLen)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export class WidgetTokenService {
  constructor(private readonly secret: string) {}

  issueToken(input: { tenantId: string; siteId: string; ttlSeconds?: number; jti: string; nowMs?: number }): string {
    const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
    const ttlSeconds = input.ttlSeconds ?? 3600;

    const header = { alg: "HS256", typ: "WJT" };
    const claims: WidgetTokenClaims = {
      tenantId: input.tenantId,
      siteId: input.siteId,
      iat: nowSeconds,
      exp: nowSeconds + Math.max(60, ttlSeconds),
      jti: input.jti,
    };

    const headerPart = base64UrlEncode(JSON.stringify(header));
    const claimsPart = base64UrlEncode(JSON.stringify(claims));
    const payload = `${headerPart}.${claimsPart}`;
    const sig = sign(this.secret, payload);
    return `${payload}.${sig}`;
  }

  verifyToken(token: string, expected: { tenantId: string; siteId: string; nowMs?: number }): { valid: true; claims: WidgetTokenClaims } | { valid: false; reason: string } {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, reason: "Malformed token" };
    }

    const [headerPart, claimsPart, sigPart] = parts;
    const payload = `${headerPart}.${claimsPart}`;
    const expectedSig = sign(this.secret, payload);

    const sigA = Buffer.from(sigPart);
    const sigB = Buffer.from(expectedSig);
    if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
      return { valid: false, reason: "Invalid signature" };
    }

    let headerJson: unknown;
    let claimsJson: unknown;
    try {
      headerJson = JSON.parse(base64UrlDecode(headerPart));
      claimsJson = JSON.parse(base64UrlDecode(claimsPart));
    } catch {
      return { valid: false, reason: "Invalid encoding" };
    }

    const header = headerSchema.safeParse(headerJson);
    if (!header.success) {
      return { valid: false, reason: "Invalid header" };
    }

    const claimsParsed = claimsSchema.safeParse(claimsJson);
    if (!claimsParsed.success) {
      return { valid: false, reason: "Invalid claims" };
    }

    const claims = claimsParsed.data;
    const nowSeconds = Math.floor((expected.nowMs ?? Date.now()) / 1000);

    if (claims.exp < nowSeconds) {
      return { valid: false, reason: "Token expired" };
    }

    if (claims.tenantId !== expected.tenantId || claims.siteId !== expected.siteId) {
      return { valid: false, reason: "Tenant/site mismatch" };
    }

    return { valid: true, claims };
  }
}

export function maybeCreateWidgetTokenService(): WidgetTokenService | null {
  const secret = process.env.WIDGET_SIGNING_SECRET;
  if (!secret || secret.trim() === "") {
    return null;
  }
  return new WidgetTokenService(secret.trim());
}
