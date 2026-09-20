import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { one, query } from "../db/pool.js";
import { emailRegex } from "../lib/tokens.js";
import { hasAccess, hasAccessSql, isAdminEmail, type UserRow } from "../services/auth.js";
import { requireAdmin } from "./alerts.js";

const USER_COLS = `u.id, u.email, u.name, u.role, u.comped, u.has_access, u.subscription_status, u.trial_ends_at,
  u.current_period_end, u.cancel_at_period_end, u.stripe_customer_id, u.created_at, u.last_login_at, u.google_sub,
  (SELECT count(*)::int FROM alert_criteria a WHERE a.user_id = u.id) AS alert_count`;

type AdminUserRow = Pick<
  UserRow,
  | "id" | "email" | "name" | "role" | "comped" | "has_access" | "subscription_status" | "trial_ends_at"
  | "current_period_end" | "cancel_at_period_end" | "stripe_customer_id" | "created_at" | "last_login_at" | "google_sub"
> & { alert_count: number };

function adminUser(u: AdminUserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    comped: u.comped,
    hasAccess: u.has_access || u.comped || u.role === "admin",
    subscriptionStatus: u.subscription_status,
    trialEndsAt: u.trial_ends_at,
    currentPeriodEnd: u.current_period_end,
    hasBillingAccount: !!u.stripe_customer_id,
    signInMethod: u.google_sub ? "google" : "email",
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    alertCount: u.alert_count,
  };
}

const idParams = z.object({ id: z.string().uuid() });

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/overview", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const [counts, sources, jobs] = await Promise.all([
      one<{ users: number; with_access: number; comped: number; paying: number; opportunities: number; alerts: number }>(
        `SELECT
           (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM users u WHERE ${hasAccessSql("u")}) AS with_access,
           (SELECT count(*)::int FROM users WHERE comped) AS comped,
           (SELECT count(*)::int FROM users WHERE subscription_status IN ('active','trialing')) AS paying,
           (SELECT count(*)::int FROM opportunities WHERE status <> 'closed') AS opportunities,
           (SELECT count(*)::int FROM alert_criteria WHERE active) AS alerts`,
      ),
      query(`SELECT id, name, kind, last_run_at, last_status, last_error, last_count FROM sources ORDER BY id`),
      query(`SELECT id, job, started_at, finished_at, status, detail FROM job_runs ORDER BY started_at DESC LIMIT 20`),
    ]);
    return { counts, sources, jobs };
  });

  app.get("/admin/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = z.object({ q: z.string().trim().max(200).optional() }).safeParse(req.query);
    const search = q.success && q.data.q ? `%${q.data.q}%` : null;
    const rows = await query<AdminUserRow>(
      `SELECT ${USER_COLS} FROM users u
       WHERE $1::text IS NULL OR u.email ILIKE $1 OR u.name ILIKE $1
       ORDER BY u.created_at DESC LIMIT 200`,
      [search],
    );
    return { items: rows.map(adminUser) };
  });

  /** Pre-creates an account (e.g. a test user) so it can be comped before its first sign-in. */
  app.post("/admin/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = z
      .object({ email: z.string().trim().toLowerCase().regex(emailRegex, "Enter a valid email address"), comped: z.boolean().default(true) })
      .safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message ?? "Invalid request" });
    const created = await one<{ id: string }>(
      `INSERT INTO users (email, comped, role) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET comped = EXCLUDED.comped
       RETURNING id`,
      [body.data.email, body.data.comped, isAdminEmail(body.data.email) ? "admin" : "user"],
    );
    const row = await one<AdminUserRow>(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [created!.id]);
    return reply.status(201).send(adminUser(row!));
  });

  app.patch<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = z.object({ comped: z.boolean().optional(), role: z.enum(["user", "admin"]).optional() }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid request" });
    if (body.data.role === "user" && params.data.id === req.user!.id) {
      return reply.status(400).send({ error: "You cannot remove your own admin role" });
    }
    const row = await one<AdminUserRow>(
      `UPDATE users SET comped = COALESCE($2, comped), role = COALESCE($3, role) WHERE id = $1
       RETURNING id`,
      [params.data.id, body.data.comped ?? null, body.data.role ?? null],
    );
    if (!row) return reply.status(404).send({ error: "Not found" });
    const full = await one<AdminUserRow>(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [params.data.id]);
    return adminUser(full!);
  });

  app.delete<{ Params: { id: string } }>("/admin/users/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const params = idParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    if (params.data.id === req.user!.id) return reply.status(400).send({ error: "You cannot delete yourself" });
    const target = await one<UserRow>(`SELECT * FROM users WHERE id = $1`, [params.data.id]);
    if (!target) return reply.status(404).send({ error: "Not found" });
    if (target.stripe_subscription_id && hasAccess(target) && target.subscription_status !== "canceled") {
      return reply.status(409).send({ error: "Cancel the Stripe subscription before deleting this user" });
    }
    await query(`DELETE FROM users WHERE id = $1`, [params.data.id]);
    return reply.status(204).send();
  });

}
