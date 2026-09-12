import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./db/migrate.js";
import { closePool } from "./db/pool.js";

process.env.SERVICE_NAME ??= "grant-radar-api";

async function main() {
  const cfg = config();
  await runMigrations();
  const app = await buildApp();
  await app.listen({ port: cfg.PORT, host: cfg.HOST });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "api shutting down");
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "api failed to start");
  process.exit(1);
});
