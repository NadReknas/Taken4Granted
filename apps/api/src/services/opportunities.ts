import { z } from "zod";
import { query, one } from "../db/pool.js";
import { CATEGORIES, ENTITY_TYPES, LEVELS, STATE_CODES, STATUSES, type OpportunityRow } from "../domain/opportunity.js";

const csv = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => {
    if (v == null || v === "") return [];
    return Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean);
  }, z.array(inner));

export const searchParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  states: csv(z.enum(STATE_CODES)).default([]),
  entityTypes: csv(z.enum(ENTITY_TYPES)).default([]),
  categories: csv(z.enum(CATEGORIES)).default([]),
  levels: csv(z.enum(LEVELS)).default([]),
  status: z.enum([...STATUSES, "all"]).default("open"),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  deadlineWithinDays: z.coerce.number().int().positive().max(3650).optional(),
  sort: z.enum(["deadline", "newest", "relevance", "amount"]).default("deadline"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

export interface SearchResult {
  items: OpportunityRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Builds the WHERE clause shared by the public search and the alert matcher.
 * Location semantics: an opportunity with no states is nationwide and matches every state filter.
 * Amount semantics: overlap between [amount_min, amount_max] and [minAmount, maxAmount]; unknown amounts match.
 */
export function buildFilters(p: SearchParams, params: unknown[], startIdx = params.length + 1): string[] {
  const where: string[] = [];
  let i = startIdx;
  const push = (v: unknown) => {
    params.push(v);
    return `$${i++}`;
  };
  if (p.status !== "all") where.push(`status = ${push(p.status)}`);
  if (p.q) where.push(`search_tsv @@ websearch_to_tsquery('english', ${push(p.q)})`);
  if (p.states.length) where.push(`(states = '{}' OR states && ${push(p.states)}::text[])`);
  if (p.entityTypes.length)
    where.push(`(entity_types = '{}' OR 'any' = ANY(entity_types) OR entity_types && ${push(p.entityTypes)}::text[])`);
  if (p.categories.length) where.push(`categories && ${push(p.categories)}::text[]`);
  if (p.levels.length) where.push(`level = ANY(${push(p.levels)}::text[])`);
  if (p.minAmount != null) where.push(`(amount_max IS NULL OR amount_max >= ${push(p.minAmount)})`);
  if (p.maxAmount != null) where.push(`(amount_min IS NULL OR amount_min <= ${push(p.maxAmount)})`);
  if (p.deadlineWithinDays != null)
    where.push(`deadline IS NOT NULL AND deadline <= now() + (${push(p.deadlineWithinDays)} || ' days')::interval`);
  if (p.status === "open") where.push(`(deadline IS NULL OR deadline >= now())`);
  return where;
}

const orderBy: Record<SearchParams["sort"], string> = {
  deadline: "deadline ASC NULLS LAST, first_seen_at DESC",
  newest: "first_seen_at DESC, deadline ASC NULLS LAST",
  amount: "amount_max DESC NULLS LAST, deadline ASC NULLS LAST",
  relevance: "rank DESC, deadline ASC NULLS LAST",
};

const COLUMNS = `id, source_id, external_id, slug, title, agency, level, states, entity_types, categories,
  summary, eligibility_text, amount_min, amount_max, total_funding, posted_at, deadline, deadline_text,
  apply_url, status, first_seen_at, last_seen_at, updated_at`;

export async function searchOpportunities(p: SearchParams): Promise<SearchResult> {
  const filterParams: unknown[] = [];
  const where = buildFilters(p, filterParams);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const params = [...filterParams];
  const rankSql = p.q ? `ts_rank(search_tsv, websearch_to_tsquery('english', $${params.push(p.q)})) AS rank` : `0 AS rank`;
  const sort = p.sort === "relevance" && !p.q ? "deadline" : p.sort;
  const limitIdx = params.push(p.pageSize);
  const offsetIdx = params.push((p.page - 1) * p.pageSize);

  const [items, count] = await Promise.all([
    query<OpportunityRow & { rank: number }>(
      `SELECT ${COLUMNS}, ${rankSql} FROM opportunities ${whereSql}
       ORDER BY ${orderBy[sort]} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    ),
    one<{ n: string }>(`SELECT count(*)::text AS n FROM opportunities ${whereSql}`, filterParams),
  ]);
  return { items, total: Number(count?.n ?? 0), page: p.page, pageSize: p.pageSize };
}

export async function getOpportunityBySlug(slug: string): Promise<OpportunityRow | null> {
  return one<OpportunityRow>(`SELECT ${COLUMNS} FROM opportunities WHERE slug = $1`, [slug]);
}

export async function listSlugsForSitemap(limit = 5000): Promise<Array<{ slug: string; updated_at: Date }>> {
  return query(`SELECT slug, updated_at FROM opportunities WHERE status <> 'closed' ORDER BY updated_at DESC LIMIT $1`, [limit]);
}

export interface DirectoryStats {
  open: number;
  closingSoon: number;
  addedThisWeek: number;
  sources: Array<{ id: string; name: string; last_run_at: Date | null; last_status: string | null; last_count: number | null }>;
}

export async function directoryStats(): Promise<DirectoryStats> {
  const [counts, sources] = await Promise.all([
    one<{ open: string; closing_soon: string; added_week: string }>(
      `SELECT
         count(*) FILTER (WHERE status = 'open' AND (deadline IS NULL OR deadline >= now()))::text AS open,
         count(*) FILTER (WHERE status = 'open' AND deadline BETWEEN now() AND now() + interval '14 days')::text AS closing_soon,
         count(*) FILTER (WHERE first_seen_at >= now() - interval '7 days')::text AS added_week
       FROM opportunities`,
    ),
    query<DirectoryStats["sources"][number]>(`SELECT id, name, last_run_at, last_status, last_count FROM sources ORDER BY id`),
  ]);
  return {
    open: Number(counts?.open ?? 0),
    closingSoon: Number(counts?.closing_soon ?? 0),
    addedThisWeek: Number(counts?.added_week ?? 0),
    sources,
  };
}
