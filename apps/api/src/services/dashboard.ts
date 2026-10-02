import { query } from "../db/pool.js";
import type { OpportunityRow } from "../domain/opportunity.js";
import { listAlerts, matchAlert, type AlertRow } from "./alerts.js";

const OPP_COLS = `o.id, o.source_id, o.external_id, o.slug, o.title, o.agency, o.level, o.states, o.entity_types, o.categories,
  o.summary, o.eligibility_text, o.amount_min, o.amount_max, o.total_funding, o.posted_at, o.deadline, o.deadline_text,
  o.apply_url, o.status, o.first_seen_at, o.last_seen_at, o.updated_at`;

export type MatchedOpportunity = OpportunityRow & { matched_alerts: Array<{ id: string; name: string }> };

/** Opportunities first seen in the window that match any of the user's active alerts, deduplicated across alerts. */
export async function matchesForUser(userId: string, since: Date, limit = 50): Promise<{ items: MatchedOpportunity[]; alerts: AlertRow[] }> {
  const alerts = (await listAlerts(userId)).filter((a) => a.active);
  const byId = new Map<string, MatchedOpportunity>();
  for (const alert of alerts) {
    for (const o of await matchAlert(alert, since, limit)) {
      const existing = byId.get(o.id);
      if (existing) existing.matched_alerts.push({ id: alert.id, name: alert.name });
      else byId.set(o.id, { ...o, matched_alerts: [{ id: alert.id, name: alert.name }] });
    }
  }
  const items = [...byId.values()]
    .sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db || new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime();
    })
    .slice(0, limit);
  return { items, alerts };
}

export type SavedOpportunity = OpportunityRow & { saved_at: Date };

export async function listSaved(userId: string): Promise<SavedOpportunity[]> {
  return query<SavedOpportunity>(
    `SELECT ${OPP_COLS}, s.created_at AS saved_at FROM saved_opportunities s JOIN opportunities o ON o.id = s.opportunity_id
     WHERE s.user_id = $1 ORDER BY o.deadline ASC NULLS LAST, s.created_at DESC`,
    [userId],
  );
}

export async function listSavedIds(userId: string): Promise<string[]> {
  const rows = await query<{ opportunity_id: string }>(`SELECT opportunity_id FROM saved_opportunities WHERE user_id = $1`, [userId]);
  return rows.map((r) => r.opportunity_id);
}

/** Returns false when the opportunity does not exist. */
export async function saveOpportunity(userId: string, opportunityId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO saved_opportunities (user_id, opportunity_id)
     SELECT $1, id FROM opportunities WHERE id = $2 ON CONFLICT DO NOTHING RETURNING opportunity_id AS id`,
    [userId, opportunityId],
  );
  if (rows.length) return true;
  const exists = await query<{ id: string }>(`SELECT id FROM opportunities WHERE id = $1`, [opportunityId]);
  return exists.length > 0;
}

export async function unsaveOpportunity(userId: string, opportunityId: string): Promise<void> {
  await query(`DELETE FROM saved_opportunities WHERE user_id = $1 AND opportunity_id = $2`, [userId, opportunityId]);
}

export interface DigestSummary {
  id: string;
  sent_at: Date;
  count: number;
  items: Array<Pick<OpportunityRow, "id" | "slug" | "title" | "agency" | "deadline" | "deadline_text" | "amount_min" | "amount_max">>;
}

export async function listDigests(userId: string, limit = 12): Promise<DigestSummary[]> {
  const digests = await query<{ id: string; sent_at: Date; opportunity_ids: string[] }>(
    `SELECT id, sent_at, opportunity_ids FROM digests WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2`,
    [userId, limit],
  );
  const ids = [...new Set(digests.flatMap((d) => d.opportunity_ids))];
  const opps = ids.length
    ? await query<DigestSummary["items"][number]>(
        `SELECT id, slug, title, agency, deadline, deadline_text, amount_min, amount_max FROM opportunities WHERE id = ANY($1::uuid[])`,
        [ids],
      )
    : [];
  const byId = new Map(opps.map((o) => [o.id, o]));
  return digests.map((d) => ({
    id: d.id,
    sent_at: d.sent_at,
    count: d.opportunity_ids.length,
    items: d.opportunity_ids.map((id) => byId.get(id)).filter((o): o is DigestSummary["items"][number] => o !== undefined),
  }));
}
