import type { FastifyInstance } from "fastify";
import { config } from "../lib/config.js";
import { safeEqual } from "../lib/tokens.js";
import { runJob } from "../jobs/index.js";

/**
 * Optional HTTP triggers for platforms with external cron (Railway cron, GitHub Actions, etc.).
 * Protected by CRON_SECRET; disabled when unset.
 */
export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { job: string } }>("/jobs/:job", { config: { rateLimit: false } }, async (req, reply) => {
    const secret = config().CRON_SECRET;
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (!secret || !safeEqual(provided, secret)) return reply.status(401).send({ error: "Unauthorized" });
    if (req.params.job !== "ingest" && req.params.job !== "digest") return reply.status(404).send({ error: "Unknown job" });
    const result = await runJob(req.params.job, req.log);
    return { job: req.params.job, result };
  });
}
