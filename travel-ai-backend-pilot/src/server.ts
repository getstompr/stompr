import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

const { app } = await buildApp();

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`travel-ai-platform listening on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
