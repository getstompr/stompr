import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPgPool } from "./pg.js";

async function main(): Promise<void> {
  const pool = createPgPool();
  const schemaPath = resolve(process.cwd(), "src", "db", "schema.sql");
  const sql = await readFile(schemaPath, "utf-8");
  await pool.query(sql);
  await pool.end();
  // eslint-disable-next-line no-console
  console.log("Database schema applied successfully.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
