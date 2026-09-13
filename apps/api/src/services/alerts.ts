import { z } from "zod";
import { one, query } from "../db/pool.js";
import { CATEGORIES, ENTITY_TYPES, STATE_CODES, US_STATES, ENTITY_TYPE_LABELS, type OpportunityRow } from "../domain/opportunity.js";
import { config } from "../lib/config.js";
import { logger, type Logger } from "../lib/logger.js";
import { emailProvider, escapeHtml, layout } from "./email.js";
import { buildFilters, searchParamsSchema } from "./opportunities.js";
import type { UserRow } from "./auth.js";

export const alertInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  states: z.array(z.enum(STATE_CODES)).max(60).default([]),
  entityTypes: z.array(z.enum(ENTITY_TYPES)).default([]),
  keywords: z.array(z.string().trim().min(2).max(60)).max(20).default([]),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  amountMin: z.number().nonnegative().nullable().default(null),
  amountMax: z.number().nonnegative().nullable().default(null),
  includeFederal: z.boolean().default(true),
  active: z.boolean().default(true),
});
export type AlertInput = z.infer<typeof alertInputSchema>;

export interface AlertRow {
  id: string;
  user_id: string;
  name: string;
  states: string[];
  entity_types: string[];
  keywords: string[];
  categories: string[];
  amount_min: string | null;
  amount_max: string | null;
  include_federal: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

const ALERT_COLS = `id, user_id, name, states, entity_types, keywords, categories, amount_min, amount_max, include_federal, active, created_at, updated_at`;

export async function listAlerts(userId: string): Promise<AlertRow[]> {
  return query<AlertRow>(`SELECT ${ALERT_COLS} FROM alert_criteria WHERE user_id = $1 ORDER BY created_at`, [userId]);
}

export async function countAlerts(userId: string): Promise<number> {
  const r = await one<{ n: string }>(`SELECT count(*)::text AS n FROM alert_criteria WHERE user_id = $1`, [userId]);
  return Number(r?.n ?? 0);
}

export async function createAlert(userId: string, input: AlertInput): Promise<AlertRow> {
  const row = await one<AlertRow>(
    `INSERT INTO alert_criteria (user_id, name, states, entity_types, keywords, categories, amount_min, amount_max, include_federal, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${ALERT_COLS}`,
    [userId, input.name, input.states, input.entityTypes, input.keywords, input.categories, input.amountMin, input.amountMax, input.includeFederal, input.active],
  );
  return row!;
}

export async function updateAlert(userId: string, id: string, input: AlertInput): Promise<AlertRow | null> {
  return one<AlertRow>(
    `UPDATE alert_criteria SET name=$3, states=$4, entity_types=$5, keywords=$6, categories=$7, amount_min=$8, amount_max=$9,
       include_federal=$10, active=$11, updated_at=now()
     WHERE id = $1 AND user_id = $2 RETURNING ${ALERT_COLS}`,
    [id, userId, input.name, input.states, input.entityTypes, input.keywords, input.categories, input.amountMin, input.amountMax, input.includeFederal, input.active],
  );
}

export async function deleteAlert(userId: string, id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM alert_criteria WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  return rows.length > 0;
}

/** Opportunities first indexed after `since` that satisfy the alert. Shares filter semantics with public search. */
export async function matchAlert(alert: AlertRow, since: Date, limit = 50): Promise<OpportunityRow[]> {
  const p = searchParamsSchema.parse({
    q: alert.keywords.length ? alert.keywords.join(" OR ") : undefined,
    states: alert.states,
    entityTypes: alert.entity_types,
    categories: alert.categories,
    levels: alert.include_federal ? [] : ["state", "local", "other"],
    minAmount: alert.amount_min ?? undefined,
    maxAmount: alert.amount_max ?? undefined,
    status: "open",
    pageSize: limit,
  });
  const params: unknown[] = [since];
  const where = ["first_seen_at > $1", ...buildFilters(p, params)];
  return query<OpportunityRow>(
    `SELECT id, source_id, external_id, slug, title, agency, level, states, entity_types, categories, summary, eligibility_text,
            amount_min, amount_max, total_funding, posted_at, deadline, deadline_text, apply_url, status, first_seen_at, last_seen_at, updated_at
     FROM opportunities WHERE ${where.join(" AND ")}
     ORDER BY deadline ASC NULLS LAST LIMIT $${params.push(limit)}`,
    params,
  );
}

export function formatMoney(v: string | number | null): string | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function amountLabel(o: Pick<OpportunityRow, "amount_min" | "amount_max">): string {
  const min = formatMoney(o.amount_min);
  const max = formatMoney(o.amount_max);
  if (min && max) return min === max ? min : `${min} – ${max}`;
  if (max) return `Up to ${max}`;
  if (min) return `From ${min}`;
  return "Amount not specified";
}

export function deadlineLabel(o: Pick<OpportunityRow, "deadline" | "deadline_text">): string {
  if (o.deadline) return new Date(o.deadline).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  return o.deadline_text ?? "Rolling / see notice";
}

export interface DigestSection {
  alert: AlertRow;
  matches: OpportunityRow[];
}

export function renderDigest(sections: DigestSection[], appUrl: string): { subject: string; html: string; text: string } {
  const total = sections.reduce((n, s) => n + s.matches.length, 0);
  const subject = `${total} new grant ${total === 1 ? "opportunity" : "opportunities"} matching your alerts`;
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  for (const s of sections) {
    const crit = [
      s.alert.states.length ? `States: ${s.alert.states.map((c) => US_STATES[c] ?? c).join(", ")}` : "Nationwide",
      s.alert.entity_types.length ? `Entity: ${s.alert.entity_types.map((e) => ENTITY_TYPE_LABELS[e as keyof typeof ENTITY_TYPE_LABELS] ?? e).join(", ")}` : null,
      s.alert.keywords.length ? `Keywords: ${s.alert.keywords.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    textParts.push(`== ${s.alert.name} (${crit}) ==`);
    htmlParts.push(`<h2 style="font-size:16px;margin:24px 0 4px">${escapeHtml(s.alert.name)}</h2><p style="color:#6b7280;font-size:12px;margin:0 0 12px">${escapeHtml(crit)}</p>`);
    for (const o of s.matches) {
      const detail = `${appUrl}/grants/${o.slug}`;
      textParts.push(`- ${o.title}\n  ${o.agency ?? ""} · Deadline: ${deadlineLabel(o)} · ${amountLabel(o)}\n  Details: ${detail}\n  Apply: ${o.apply_url}`);
      htmlParts.push(`<div style="border-top:1px solid #e5e7eb;padding:12px 0">
  <a href="${escapeHtml(detail)}" style="font-weight:600;color:#166534;text-decoration:none">${escapeHtml(o.title)}</a>
  <div style="color:#374151;font-size:13px;margin-top:4px">${escapeHtml(o.agency ?? "")}</div>
  <div style="font-size:13px;margin-top:4px"><strong>Deadline:</strong> ${escapeHtml(deadlineLabel(o))} &nbsp;·&nbsp; <strong>Award:</strong> ${escapeHtml(amountLabel(o))}</div>
  <div style="font-size:13px;margin-top:6px"><a href="${escapeHtml(o.apply_url)}" style="color:#1d4ed8">Official application page →</a></div>
</div>`);
    }
  }
  const html = layout(subject, htmlParts.join("") + `<p style="margin-top:24px"><a href="${escapeHtml(appUrl)}/dashboard" style="color:#1d4ed8">Manage your alerts</a></p>`);
  const text = `${subject}\n\n${textParts.join("\n\n")}\n\nManage alerts: ${appUrl}/dashboard`;
  return { subject, html, text };
}

export interface DigestRunResult {
  usersConsidered: number;
  emailsSent: number;
  opportunitiesDelivered: number;
  errors: number;
}

/**
 * For every user with access: collect opportunities first seen since their last digest
 * (or the past 7 days for a first digest), grouped by alert; send one email per user.
 */
export async function runDigests(log: Logger = logger, now = new Date()): Promise<DigestRunResult> {
  const cfg = config();
  const result: DigestRunResult = { usersConsidered: 0, emailsSent: 0, opportunitiesDelivered: 0, errors: 0 };
  const users = await query<UserRow & { last_digest_at: Date | null }>(
    `SELECT u.*, (SELECT max(sent_at) FROM digests d WHERE d.user_id = u.id) AS last_digest_at
     FROM users u
     WHERE u.has_access = true AND EXISTS (SELECT 1 FROM alert_criteria a WHERE a.user_id = u.id AND a.active)`,
  );
  for (const user of users) {
    result.usersConsidered++;
    const since = user.last_digest_at ?? new Date(now.getTime() - 7 * 86_400_000);
    try {
      const alerts = (await listAlerts(user.id)).filter((a) => a.active);
      const sections: DigestSection[] = [];
      const seen = new Set<string>();
      for (const alert of alerts) {
        const matches = (await matchAlert(alert, since)).filter((o) => !seen.has(o.id));
        matches.forEach((o) => seen.add(o.id));
        if (matches.length) sections.push({ alert, matches });
      }
      if (!sections.length) continue;
      const msg = renderDigest(sections, cfg.APP_URL);
      const sent = await emailProvider().send({ to: user.email, ...msg });
      await query(`INSERT INTO digests (user_id, sent_at, opportunity_ids, provider_message_id) VALUES ($1,$2,$3,$4)`, [
        user.id,
        now,
        [...seen],
        sent.id,
      ]);
      result.emailsSent++;
      result.opportunitiesDelivered += seen.size;
      log.info({ userId: user.id, matches: seen.size }, "digest sent");
    } catch (err) {
      result.errors++;
      log.error({ err, userId: user.id }, "digest failed for user");
    }
  }
  return result;
}
