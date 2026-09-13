import { z } from "zod";
import { fetchWithRetry } from "../lib/retry.js";
import {
  inferCategories,
  normalizedOpportunitySchema,
  parseMoney,
  stripHtml,
  type Category,
  type EntityType,
  type NormalizedOpportunity,
} from "../domain/opportunity.js";
import type { GrantsGovSourceConfig, SourceAdapter, SourceContext } from "./types.js";

const SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const DETAIL_URL = "https://api.grants.gov/v1/api/fetchOpportunity";
const PUBLIC_URL = (id: string) => `https://www.grants.gov/search-results-detail/${id}`;

export const searchHitSchema = z.object({
  id: z.coerce.string(),
  number: z.string(),
  title: z.string(),
  agencyCode: z.string().optional().nullable(),
  agency: z.string().optional().nullable(),
  openDate: z.string().optional().nullable(),
  closeDate: z.string().optional().nullable(),
  oppStatus: z.string(),
  docType: z.string().optional(),
  cfdaList: z.array(z.string()).optional(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  errorcode: z.number(),
  data: z.object({
    hitCount: z.number(),
    startRecord: z.number(),
    oppHits: z.array(searchHitSchema),
  }),
});

const idDesc = z.object({ id: z.string(), description: z.string() });

export const synopsisSchema = z.object({
  synopsisDesc: z.string().optional().nullable(),
  applicantEligibilityDesc: z.string().optional().nullable(),
  awardCeiling: z.union([z.string(), z.number()]).optional().nullable(),
  awardFloor: z.union([z.string(), z.number()]).optional().nullable(),
  estimatedFunding: z.union([z.string(), z.number()]).optional().nullable(),
  responseDateStr: z.string().optional().nullable(),
  responseDateDesc: z.string().optional().nullable(),
  postingDateStr: z.string().optional().nullable(),
  fundingDescLinkUrl: z.string().optional().nullable(),
  applicantTypes: z.array(idDesc).optional(),
  fundingActivityCategories: z.array(idDesc).optional(),
  agencyName: z.string().optional().nullable(),
});

export const detailResponseSchema = z.object({
  errorcode: z.number(),
  data: z.object({
    id: z.coerce.string(),
    opportunityNumber: z.string().optional(),
    opportunityTitle: z.string().optional(),
    synopsis: synopsisSchema.optional().nullable(),
    forecast: synopsisSchema.optional().nullable(),
  }),
});

/** Grants.gov applicant-type ids -> normalised entity types. */
export const APPLICANT_TYPE_MAP: Record<string, EntityType> = {
  "00": "state_government",
  "01": "local_government",
  "02": "local_government",
  "04": "local_government",
  "05": "education",
  "06": "education",
  "07": "tribal",
  "08": "local_government",
  "11": "tribal",
  "12": "nonprofit",
  "13": "nonprofit",
  "20": "education",
  "21": "individual",
  "22": "for_profit",
  "23": "small_business",
  "99": "any",
};

export const CATEGORY_MAP: Record<string, Category> = {
  AG: "agriculture",
  BC: "business",
  CD: "community_development",
  EN: "energy",
  ENV: "environment",
  IIJ: "infrastructure",
  NR: "natural_resources",
  RD: "rural_development",
  T: "infrastructure",
};

/** "MM/DD/YYYY" (search) or "YYYY-MM-DD-HH-mm-ss" (detail). Returned as end-of-day UTC-ish for deadlines. */
export function parseGrantsGovDate(v: string | null | undefined, endOfDay = false): Date | null {
  if (!v) return null;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  let y: number, mo: number, d: number;
  if (m) {
    mo = Number(m[1]);
    d = Number(m[2]);
    y = Number(m[3]);
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (!m) return null;
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  }
  const date = endOfDay ? new Date(Date.UTC(y, mo - 1, d, 23, 59, 59)) : new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeHit(
  hit: SearchHit,
  detail: z.infer<typeof synopsisSchema> | null,
  sourceId: string,
): NormalizedOpportunity {
  const summary = stripHtml(detail?.synopsisDesc);
  const eligibilityText = stripHtml(detail?.applicantEligibilityDesc);
  const entityTypes = [
    ...new Set((detail?.applicantTypes ?? []).map((a) => APPLICANT_TYPE_MAP[a.id]).filter((x): x is EntityType => !!x)),
  ];
  const seedCats = (detail?.fundingActivityCategories ?? [])
    .map((c) => CATEGORY_MAP[c.id])
    .filter((x): x is Category => !!x);
  const categories = inferCategories(`${hit.title} ${summary ?? ""}`, seedCats);
  const deadline = parseGrantsGovDate(detail?.responseDateStr ?? hit.closeDate, true);
  const status = hit.oppStatus === "forecasted" ? "forecasted" : hit.oppStatus === "posted" ? "open" : "closed";

  return normalizedOpportunitySchema.parse({
    sourceId,
    externalId: hit.id,
    title: stripHtml(hit.title) ?? hit.title,
    agency: detail?.agencyName ?? hit.agency ?? null,
    level: "federal",
    states: [],
    entityTypes,
    categories: categories.length ? categories : ["other"],
    summary,
    eligibilityText,
    amountMin: parseMoney(detail?.awardFloor),
    amountMax: parseMoney(detail?.awardCeiling),
    totalFunding: parseMoney(detail?.estimatedFunding),
    postedAt: parseGrantsGovDate(detail?.postingDateStr ?? hit.openDate),
    deadline,
    deadlineText: detail?.responseDateDesc?.trim() || null,
    applyUrl: PUBLIC_URL(hit.id),
    status,
    raw: { hit, detail },
  });
}

export class GrantsGovSource implements SourceAdapter {
  constructor(public readonly config: GrantsGovSourceConfig) {}

  async fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]> {
    const rows = 100;
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    const keywords = this.config.keywords?.length ? this.config.keywords : [""];

    for (const keyword of keywords) {
      for (let start = 0; start < ctx.maxItems; start += rows) {
        const body = {
          rows,
          startRecordNum: start,
          oppStatuses: "posted|forecasted",
          keyword,
          fundingCategories: (this.config.fundingCategories ?? []).join("|"),
          eligibilities: (this.config.eligibilities ?? []).join("|"),
        };
        const res = await fetchWithRetry(
          SEARCH_URL,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), fetchImpl: ctx.fetchImpl },
          { onRetry: (err, attempt, delay) => ctx.log.warn({ err, attempt, delay, keyword }, "grants.gov search retry") },
        );
        const parsed = searchResponseSchema.parse(await res.json());
        for (const h of parsed.data.oppHits) {
          if (!seen.has(h.id)) {
            seen.add(h.id);
            hits.push(h);
          }
        }
        if (start + rows >= parsed.data.hitCount || parsed.data.oppHits.length === 0) break;
      }
    }
    ctx.log.info({ source: this.config.id, hits: hits.length }, "grants.gov search complete");

    const out: NormalizedOpportunity[] = [];
    for (const hit of hits.slice(0, ctx.maxItems)) {
      let detail: z.infer<typeof synopsisSchema> | null = null;
      if (this.config.fetchDetails !== false) {
        try {
          const res = await fetchWithRetry(
            DETAIL_URL,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ opportunityId: Number(hit.id) }),
              fetchImpl: ctx.fetchImpl,
            },
            { retries: 3, onRetry: (err, attempt) => ctx.log.warn({ err, attempt, id: hit.id }, "detail retry") },
          );
          const d = detailResponseSchema.parse(await res.json());
          detail = d.data.synopsis ?? d.data.forecast ?? null;
        } catch (err) {
          ctx.log.warn({ err, id: hit.id }, "grants.gov detail fetch failed; indexing summary only");
        }
      }
      try {
        out.push(normalizeHit(hit, detail, this.config.id));
      } catch (err) {
        ctx.log.warn({ err, id: hit.id }, "grants.gov hit failed validation; skipped");
      }
    }
    return out;
  }
}
