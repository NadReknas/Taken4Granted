import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./lib/config.js";
import { loggerOptions } from "./lib/logger.js";
import { getPool } from "./db/pool.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOpportunityRoutes } from "./routes/opportunities.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { getUserBySession, SESSION_COOKIE, type UserRow } from "./services/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

export interface BuildAppOptions {
  /** Test hook: bypass DB-backed session lookup. */
  resolveUser?: (sessionToken: string | undefined) => Promise<UserRow | null>;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const cfg = config();
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    disableRequestLogging: cfg.NODE_ENV === "test",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cookie);
  await app.register(cors, { origin: [cfg.APP_URL], credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  // Stripe signature verification needs the raw body.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    if (req.url.startsWith("/webhooks/stripe")) {
      done(null, body);
      return;
    }
    if ((body as Buffer).length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.decorateRequest("user", null);
  const resolveUser = opts.resolveUser ?? getUserBySession;
  app.addHook("preHandler", async (req) => {
    req.user = await resolveUser(req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, "unhandled error");
    reply.status(status).send({ error: status >= 500 ? "Internal Server Error" : err.message, code: err.code });
  });

  app.get("/healthz", async (req, reply) => {
    try {
      await getPool().query("SELECT 1");
      return { status: "ok", db: "ok", time: new Date().toISOString() };
    } catch (err) {
      req.log.error({ err }, "healthcheck db failure");
      return reply.status(503).send({ status: "degraded", db: "unreachable" });
    }
  });
  app.get("/readyz", async () => ({ status: "ok" }));

  await registerAuthRoutes(app);
  await registerOpportunityRoutes(app);
  await registerAlertRoutes(app);
  await registerBillingRoutes(app);
  await registerJobRoutes(app);

  return app;
}
