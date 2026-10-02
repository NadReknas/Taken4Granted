import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listDigests, listSaved, listSavedIds, matchesForUser, saveOpportunity, unsaveOpportunity } from "../services/dashboard.js";
import { requireAccess, requireUser } from "./alerts.js";

const oppParams = z.object({ id: z.string().uuid() });
const matchesQuery = z.object({ days: z.coerce.number().int().positive().max(365).default(30) });

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  /** Everything the user's active alerts matched recently, deduplicated. */
  app.get("/alerts/matches", async (req, reply) => {
    if (!requireAccess(req, reply)) return;
    const q = matchesQuery.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ error: "Invalid query" });
    const since = new Date(Date.now() - q.data.days * 86_400_000);
    const { items, alerts } = await matchesForUser(req.user!.id, since);
    return { items, since, activeAlerts: alerts.length };
  });

  app.get("/saved", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    return { items: await listSaved(req.user!.id) };
  });

  app.get("/saved/ids", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    return { ids: await listSavedIds(req.user!.id) };
  });

  app.put<{ Params: { id: string } }>("/saved/:id", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const params = oppParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const ok = await saveOpportunity(req.user!.id, params.data.id);
    return ok ? { ok: true } : reply.status(404).send({ error: "Not found" });
  });

  app.delete<{ Params: { id: string } }>("/saved/:id", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const params = oppParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    await unsaveOpportunity(req.user!.id, params.data.id);
    return { ok: true };
  });

  app.get("/digests", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    return { items: await listDigests(req.user!.id) };
  });
}
