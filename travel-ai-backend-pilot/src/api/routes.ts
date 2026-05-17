import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { Platform } from "../core/platform.js";
import { maybeCreateWidgetTokenService } from "../security/widgetToken.js";
import { chatMessageRequestSchema, ingestSourceSchema, leadProfileSchema } from "../core/types.js";

const sessionCreateSchema = z.object({
  tenantId: z.string(),
  siteId: z.string(),
  visitorId: z.string().default(() => randomUUID()),
  consentGiven: z.boolean(),
  widgetToken: z.string().optional(),
});

const widgetTokenIssueSchema = z.object({
  tenantId: z.string(),
  siteId: z.string(),
  ttlSeconds: z.number().int().min(60).max(60 * 60 * 24 * 30).optional(),
});

const escalateSchema = z.object({
  tenantId: z.string(),
  sessionId: z.string(),
  reason: z.string().min(2),
});

const ingestRunSchema = z.object({
  tenantId: z.string(),
  sourceId: z.string(),
});

const analyticsQuerySchema = z.object({
  tenantId: z.string(),
});

const leadContactSchema = z.object({
  tenantId: z.string(),
  sessionId: z.string(),
  contactEmail: z.string().email(),
});

const widgetEventSchema = z.object({
  tenantId: z.string(),
  siteId: z.string(),
  sessionId: z.string().optional(),
  widgetToken: z.string().optional(),
  event: z.enum(["widget_loaded", "widget_opened", "widget_closed", "message_sent", "handoff_clicked", "error"]),
  metadata: z.record(z.string(), z.string()).default({}),
});

const widgetBootstrapPath = resolve(process.cwd(), "public", "widget", "travel-widget.v1.js");

function normalizeHost(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .trim();
}

function validateSignedWidgetToken(args: { token: string | undefined; tenantId: string; siteId: string }): { ok: true } | { ok: false; code: number; error: string } {
  const service = maybeCreateWidgetTokenService();
  if (!service) {
    return { ok: true };
  }

  if (!args.token) {
    return { ok: false, code: 401, error: "Missing widgetToken" };
  }

  const verified = service.verifyToken(args.token, {
    tenantId: args.tenantId,
    siteId: normalizeHost(args.siteId),
  });

  if (!verified.valid) {
    return { ok: false, code: 401, error: `Invalid widgetToken: ${verified.reason}` };
  }

  return { ok: true };
}

export async function registerRoutes(app: FastifyInstance, platform: Platform): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/widget/v1.js", async (_req, reply) => {
    const script = await readFile(widgetBootstrapPath, "utf-8");
    reply.header("content-type", "application/javascript; charset=utf-8");
    reply.header("cache-control", "public, max-age=86400, immutable");
    return reply.send(script);
  });

  app.post("/v1/widget/token", async (req, reply) => {
    const parsed = widgetTokenIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const adminKey = process.env.WIDGET_ADMIN_KEY;
    if (!adminKey || adminKey.trim() === "") {
      return reply.status(503).send({ error: "Widget token issuance is not enabled" });
    }

    const providedAdminKey = req.headers["x-widget-admin-key"];
    if (providedAdminKey !== adminKey) {
      return reply.status(401).send({ error: "Unauthorized token issuance request" });
    }

    const tokenService = maybeCreateWidgetTokenService();
    if (!tokenService) {
      return reply.status(503).send({ error: "WIDGET_SIGNING_SECRET is not configured" });
    }

    const tenant = await platform.store.getTenant(parsed.data.tenantId);
    if (!tenant) {
      return reply.status(404).send({ error: "Unknown tenant" });
    }

    const normalizedSite = normalizeHost(parsed.data.siteId);
    const allowed = tenant.allowedDomains.map((d) => normalizeHost(d));
    if (allowed.length > 0 && !allowed.includes(normalizedSite)) {
      return reply.status(403).send({ error: "siteId is not authorized for this tenant" });
    }

    const token = tokenService.issueToken({
      tenantId: parsed.data.tenantId,
      siteId: normalizedSite,
      ttlSeconds: parsed.data.ttlSeconds,
      jti: randomUUID(),
    });

    return reply.status(201).send({
      token,
      tenantId: parsed.data.tenantId,
      siteId: normalizedSite,
      expiresInSeconds: parsed.data.ttlSeconds ?? 3600,
    });
  });

  app.post("/v1/widget/event", async (req, reply) => {
    const parsed = widgetEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const tokenCheck = validateSignedWidgetToken({
      token: parsed.data.widgetToken,
      tenantId: parsed.data.tenantId,
      siteId: parsed.data.siteId,
    });
    if (!tokenCheck.ok) {
      return reply.status(tokenCheck.code).send({ error: tokenCheck.error });
    }

    await platform.store.addAudit(
      parsed.data.tenantId,
      `widget_${parsed.data.event}`,
      "widget_event",
      parsed.data.sessionId ?? `${parsed.data.siteId}_anonymous`,
      "visitor",
      {
        siteId: parsed.data.siteId,
        ...parsed.data.metadata,
      },
    );

    return reply.status(202).send({ accepted: true });
  });

  app.post("/v1/chat/session", async (req, reply) => {
    const parsed = sessionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const tenant = await platform.store.getTenant(parsed.data.tenantId);
    if (!tenant) {
      return reply.status(404).send({ error: "Unknown tenant" });
    }

    const normalizedSite = normalizeHost(parsed.data.siteId);
    const allowed = tenant.allowedDomains.map((d) => normalizeHost(d));
    if (allowed.length > 0 && !allowed.includes(normalizedSite)) {
      return reply.status(403).send({ error: "siteId is not authorized for this tenant" });
    }

    const tokenCheck = validateSignedWidgetToken({
      token: parsed.data.widgetToken,
      tenantId: parsed.data.tenantId,
      siteId: normalizedSite,
    });
    if (!tokenCheck.ok) {
      return reply.status(tokenCheck.code).send({ error: tokenCheck.error });
    }

    const session = await platform.orchestrator.createSession({
      tenantId: parsed.data.tenantId,
      siteId: normalizedSite,
      visitorId: parsed.data.visitorId,
      consentGiven: parsed.data.consentGiven,
    });

    return reply.status(201).send(session);
  });

  app.post("/v1/chat/message", async (req, reply) => {
    const parsed = chatMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const response = await platform.orchestrator.handleMessage(parsed.data.tenantId, parsed.data.sessionId, parsed.data.message);
      return reply.send(response);
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  });

  app.post("/v1/lead/qualify", async (req, reply) => {
    const parsed = leadProfileSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const tenantId = parsed.data.tenantId;
    const sessionId = parsed.data.sessionId;
    if (!tenantId || !sessionId) {
      return reply.status(400).send({ error: "tenantId and sessionId are required" });
    }

    const result = await platform.orchestrator.qualifyLead(parsed.data as z.infer<typeof leadProfileSchema>);
    return reply.send(result);
  });

  app.post("/v1/lead/contact", async (req, reply) => {
    const parsed = leadContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const lead = await platform.orchestrator.captureLeadContact(
        parsed.data.tenantId,
        parsed.data.sessionId,
        parsed.data.contactEmail,
      );
      return reply.send({ ok: true, lead });
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  app.post("/v1/handoff/escalate", async (req, reply) => {
    const parsed = escalateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const result = await platform.orchestrator.escalate(parsed.data.tenantId, parsed.data.sessionId, parsed.data.reason);
      return reply.status(201).send(result);
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  app.post("/v1/ingest/source", async (req, reply) => {
    const parsed = ingestSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const source = await platform.ingest.registerSource(parsed.data);
    return reply.status(201).send(source);
  });

  app.post("/v1/ingest/run", async (req, reply) => {
    const parsed = ingestRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const result = await platform.ingest.runSource(parsed.data.tenantId, parsed.data.sourceId);
      return reply.send(result);
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  });

  app.get("/v1/analytics/funnel", async (req, reply) => {
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    return reply.send(await platform.analytics.getFunnel(parsed.data.tenantId));
  });

  app.get("/v1/audit", async (req, reply) => {
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    return reply.send({ tenantId: parsed.data.tenantId, events: await platform.store.getAudits(parsed.data.tenantId) });
  });

  app.post("/v1/admin/purge", async (req, reply) => {
    const adminKey = process.env.WIDGET_ADMIN_KEY;
    if (!adminKey || req.headers["x-widget-admin-key"] !== adminKey) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const parsed = analyticsQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const tenant = await platform.store.getTenant(parsed.data.tenantId);
    if (!tenant) {
      return reply.status(404).send({ error: "Unknown tenant" });
    }

    const purged = await platform.store.purgeExpiredSessions(
      parsed.data.tenantId,
      tenant.dataRetentionDays,
    );

    return reply.send({ tenantId: parsed.data.tenantId, purgedSessions: purged, retentionDays: tenant.dataRetentionDays });
  });
}
