import cron from "node-cron";
import http from "node:http";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./db/migrate.js";
import { closePool, getPool } from "./db/pool.js";
import { runJob } from "./jobs/index.js";

process.env.SERVICE_NAME ??= "grant-radar-worker";

async function main() {
  const cfg = config();
  await runMigrations();

  const schedule = (name: "ingest" | "digest", expr: string) => {
    if (!cron.validate(expr)) throw new Error(`Invalid cron expression for ${name}: ${expr}`);
    cron.schedule(expr, () => runJob(name).catch(() => undefined), { timezone: "UTC" });
    logger.info({ job: name, cron: expr }, "job scheduled");
  };
  schedule("ingest", cfg.INGEST_CRON);
  schedule("digest", cfg.DIGEST_CRON);

  if (process.env.RUN_ON_START === "true") {
    runJob("ingest").then(() => runJob("digest")).catch(() => undefined);
  }

  // Tiny health endpoint so the worker can be health-checked by the platform.
  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      try {
        await getPool().query("SELECT 1");
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok" }));
      } catch {
        res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ status: "degraded" }));
      }
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(Number(process.env.WORKER_PORT ?? cfg.PORT), cfg.HOST, () =>
    logger.info({ port: process.env.WORKER_PORT ?? cfg.PORT }, "worker health server listening"),
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
