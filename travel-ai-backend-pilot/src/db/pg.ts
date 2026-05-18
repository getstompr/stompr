import { Pool } from "pg";

export function createPgPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Postgres storage backend");
  }

  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}
