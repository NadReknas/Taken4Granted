import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  alertInputSchema,
  countAlerts,
  createAlert,
  deleteAlert,
  listAlerts,
  matchAlert,
  updateAlert,
} from "../services/alerts.js";

const MAX_ALERTS_PER_USER = 25;

export function requireUser(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.user) {
    reply.status(401).send({ error: "Sign in required" });
    return false;
  }
  return true;
}

/** Access gating: alerts are the paid feature. Directory browsing stays public. */
export function requireAccess(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!requireUser(req, reply)) return false;
  if (!req.user!.has_access) {
    reply.status(402).send({ error: "An active subscription or trial is required", code: "SUBSCRIPTION_REQUIRED" });
    return false;
  }
  return true;
}

const idParams = z.object({ id: z.string().uuid() });

export async function registerAlertRoutes(app: FastifyInstance): Promise<void> {
  app.get("/alerts", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    return { items: await listAlerts(req.user!.id) };
  });

  app.post("/alerts", async (req, reply) => {
    if (!requireAccess(req, reply)) return;
    const parsed = alertInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid alert", issues: parsed.error.issues });
    if ((await countAlerts(req.user!.id)) >= MAX_ALERTS_PER_USER)
      return reply.status(400).send({ error: `Maximum of ${MAX_ALERTS_PER_USER} alerts` });
    return reply.status(201).send(await createAlert(req.user!.id, parsed.data));
  });

  app.put<{ Params: { id: string } }>("/alerts/:id", async (req, reply) => {
    if (!requireAccess(req, reply)) return;
    const params = idParams.safeParse(req.params);
    const parsed = alertInputSchema.safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: "Invalid alert" });
    const row = await updateAlert(req.user!.id, params.data.id, parsed.data);
    if (!row) return reply.status(404).send({ error: "Not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/alerts/:id", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const ok = await deleteAlert(req.user!.id, params.data.id);
    return ok ? { ok: true } : reply.status(404).send({ error: "Not found" });
  });

  /** Preview what the alert would have matched over the past 30 days. */
  app.get<{ Params: { id: string } }>("/alerts/:id/preview", async (req, reply) => {
    if (!requireAccess(req, reply)) return;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const alert = (await listAlerts(req.user!.id)).find((a) => a.id === params.data.id);
    if (!alert) return reply.status(404).send({ error: "Not found" });
    const since = new Date(Date.now() - 30 * 86_400_000);
    return { items: await matchAlert(alert, since, 20) };
  });
}
