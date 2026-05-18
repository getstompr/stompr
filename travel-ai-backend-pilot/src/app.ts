import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Platform } from "./core/platform.js";
import { registerOptionalRateLimit } from "./api/rateLimit.js";
import { registerRoutes } from "./api/routes.js";

function parseCorsOrigins(raw: string | undefined): string[] | "*" {
  if (!raw || raw.trim() === "") {
    return "*";
  }

  const trimmed = raw.trim();
  if (trimmed === "*") {
    return "*";
  }

  return trimmed
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function buildApp(): Promise<{ app: FastifyInstance; platform: Platform }> {
  const app = Fastify({ logger: false });
  registerOptionalRateLimit(app);

  const allowedOrigins = parseCorsOrigins(process.env.CORS_ALLOW_ORIGINS);
  await app.register(cors, {
    origin: allowedOrigins === "*" ? true : (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  const platform = await Platform.create();
  await registerRoutes(app, platform);
  return { app, platform };
}
