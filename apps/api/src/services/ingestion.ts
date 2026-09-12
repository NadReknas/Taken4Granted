import { query, one } from "../db/pool.js";
import { logger, type Logger } from "../lib/logger.js";
import { buildSlug, type NormalizedOpportunity } from "../domain/opportunity.js";
import type { SourceAdapter } from "../sources/types.js";

export interface IngestResult {
  sourceId: string;
  fetched: number;
  inserted: number;
  updated: number;
  closed: number;
  error?: string;
}

export async function upsertOpportunity(o: NormalizedOpportunity): Promise<"inserted" | "updated"> {
  const slug = buildSlug(o);
  const row = await one<{ inserted: boolean }>(
    `INSERT INTO opportunities (
       source_id, external_id, slug, title, agency, level, states, entity_types, categories,
       summary, eligibility_text, amount_min, amount_max, total_funding, posted_at, deadline,
       deadline_text, apply_url, status, raw, last_seen_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),now())
     ON CONFLICT (source_id, external_id) DO UPDATE SET
       title = EXCLUDED.title, agency = EXCLUDED.agency, level = EXCLUDED.level,
       states = EXCLUDED.states, entity_types = EXCLUDED.entity_types, categories = EXCLUDED.categories,
       summary = EXCLUDED.summary, eligibility_text = EXCLUDED.eligibility_text,
       amount_min = EXCLUDED.amount_min, amount_max = EXCLUDED.amount_max, total_funding = EXCLUDED.total_funding,
       posted_at = EXCLUDED.posted_at, deadline = EXCLUDED.deadline, deadline_text = EXCLUDED.deadline_text,
       apply_url = EXCLUDED.apply_url, status = EXCLUDED.status, raw = EXCLUDED.raw,
       last_seen_at = now(), updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      o.sourceId,
      o.externalId,
      slug,
      o.title,
      o.agency,
      o.level,
      o.states,
      o.entityTypes,
      o.categories,
      o.summary,
      o.eligibilityText,
      o.amountMin,
      o.amountMax,
      o.totalFunding,
      o.postedAt,
      o.deadline,
      o.deadlineText,
      o.applyUrl,
      o.status,
      o.raw == null ? null : JSON.stringify(o.raw),
    ],
  );
  return row?.inserted ? "inserted" : "updated";
}

/** Anything the source no longer lists (or whose deadline passed) is closed, never deleted, so URLs stay stable. */
export async function closeStale(sourceId: string, runStartedAt: Date): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE opportunities SET status = 'closed', updated_at = now()
     WHERE source_id = $1 AND status <> 'closed'
       AND (last_seen_at < $2 OR (deadline IS NOT NULL AND deadline < now()))
     RETURNING id`,
    [sourceId, runStartedAt],
  );
  return rows.length;
}

export async function ingestSource(adapter: SourceAdapter, maxItems: number, log: Logger = logger): Promise<IngestResult> {
  const { id, name, kind } = adapter.config;
  const startedAt = new Date();
  const slog = log.child({ source: id });
  await query(
    `INSERT INTO sources (id, name, kind) VALUES ($1,$2,$3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`,
    [id, name, kind],
  );
  const result: IngestResult = { sourceId: id, fetched: 0, inserted: 0, updated: 0, closed: 0 };
  try {
    const items = await adapter.fetch({ log: slog, maxItems });
    result.fetched = items.length;
    for (const item of items) {
      const outcome = await upsertOpportunity(item);
      result[outcome]++;
    }
    if (items.length > 0) result.closed = await closeStale(id, startedAt);
    await query(
      `UPDATE sources SET last_run_at = now(), last_status = 'ok', last_error = NULL, last_count = $2 WHERE id = $1`,
      [id, items.length],
    );
    slog.info(result, "source ingested");
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    await query(`UPDATE sources SET last_run_at = now(), last_status = 'error', last_error = $2 WHERE id = $1`, [
      id,
      result.error,
    ]);
    slog.error({ err }, "source ingestion failed");
  }
  return result;
}

export async function ingestAll(adapters: SourceAdapter[], maxItems: number, log: Logger = logger): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const a of adapters) results.push(await ingestSource(a, maxItems, log));
  return results;
}
