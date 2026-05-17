import type { FastifyInstance, FastifyRequest } from "fastify";

type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

type RateLimitConfig = {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  excludePathPrefixes: string[];
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function parseIntWithFloor(raw: string | undefined, fallback: number, min: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

function parsePathPrefixes(raw: string | undefined): string[] {
  const value = (raw ?? "/health,/widget/v1.js").trim();
  if (!value) return [];
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.startsWith("/") ? x : `/${x}`));
}

function readRateLimitConfig(env: NodeJS.ProcessEnv): RateLimitConfig {
  return {
    enabled: parseBool(env.RATE_LIMIT_ENABLED, false),
    windowMs: parseIntWithFloor(env.RATE_LIMIT_WINDOW_MS, 60_000, 1_000),
    maxRequests: parseIntWithFloor(env.RATE_LIMIT_MAX_REQUESTS, 120, 1),
    excludePathPrefixes: parsePathPrefixes(env.RATE_LIMIT_EXCLUDE_PATH_PREFIXES),
  };
}

function resolveClientIp(req: FastifyRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim() !== "") {
    return xff.split(",")[0]?.trim() ?? req.ip;
  }

  if (Array.isArray(xff) && xff.length > 0 && xff[0]) {
    return String(xff[0]).split(",")[0]?.trim() ?? req.ip;
  }

  return req.ip;
}

export function registerOptionalRateLimit(app: FastifyInstance): void {
  const config = readRateLimitConfig(process.env);
  if (!config.enabled) {
    return;
  }

  const byClient = new Map<string, RateLimitEntry>();

  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return;

    const path = req.url.split("?")[0] ?? req.url;
    if (config.excludePathPrefixes.some((prefix) => path.startsWith(prefix))) {
      return;
    }

    const now = Date.now();
    const key = `${resolveClientIp(req)}|${path}`;
    const current = byClient.get(key);

    if (!current || current.resetAtMs <= now) {
      byClient.set(key, {
        count: 1,
        resetAtMs: now + config.windowMs,
      });

      reply.header("x-ratelimit-limit", String(config.maxRequests));
      reply.header("x-ratelimit-remaining", String(Math.max(config.maxRequests - 1, 0)));
      reply.header("x-ratelimit-reset", String(Math.ceil((now + config.windowMs) / 1000)));
      return;
    }

    current.count += 1;
    byClient.set(key, current);

    const remaining = Math.max(config.maxRequests - current.count, 0);
    reply.header("x-ratelimit-limit", String(config.maxRequests));
    reply.header("x-ratelimit-remaining", String(remaining));
    reply.header("x-ratelimit-reset", String(Math.ceil(current.resetAtMs / 1000)));

    if (current.count > config.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAtMs - now) / 1000));
      reply.header("retry-after", String(retryAfterSec));
      return reply.status(429).send({
        error: "Rate limit exceeded",
        retryAfterSec,
      });
    }
  });
}
