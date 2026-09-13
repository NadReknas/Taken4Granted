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
import type { CaGrantsSourceConfig, SourceAdapter, SourceContext } from "./types.js";

const API = "https://data.ca.gov/api/3/action/datastore_search";
const DEFAULT_RESOURCE = "111c8c88-21f6-453c-ae2c-b4785a0624f5";
const PORTAL_URL = (id: string) => `https://www.grants.ca.gov/grants/${id}/`;

const str = z.string().nullable().optional();

export const caRecordSchema = z
  .object({
    PortalID: z.coerce.string(),
    GrantID: str,
    Status: str,
    AgencyDept: str,
    Title: z.string(),
    Categories: str,
    Purpose: str,
    Description: str,
    ApplicantType: str,
    ApplicantTypeNotes: str,
    EstAvailFunds: str,
    EstAmounts: str,
    OpenDate: str,
    ApplicationDeadline: str,
    GrantURL: str,
    LastUpdated: str,
  })
  .passthrough();
export type CaRecord = z.infer<typeof caRecordSchema>;

export const caResponseSchema = z.object({
  success: z.boolean(),
  result: z.object({ total: z.number(), records: z.array(z.unknown()) }),
});

const APPLICANT_MAP: Array<[RegExp, EntityType]> = [
  [/business/i, "small_business"],
  [/nonprofit|non-profit/i, "nonprofit"],
  [/individual/i, "individual"],
  [/public agency|local government/i, "local_government"],
  [/tribal/i, "tribal"],
  [/education|school|university|college/i, "education"],
];

const CA_CATEGORY_MAP: Array<[RegExp, Category]> = [
  [/energy/i, "energy"],
  [/environment|water/i, "environment"],
  [/agricultur|food/i, "agriculture"],
  [/economic development|business/i, "business"],
  [/housing|community/i, "community_development"],
  [/transportation|infrastructure/i, "infrastructure"],
  [/natural resource|parks/i, "natural_resources"],
];

/** "$1,000,000" | "$5,000 - $50,000" | "up to $500,000" -> [min,max] */
export function parseAmountRange(v: string | null | undefined): { min: number | null; max: number | null } {
  if (!v) return { min: null, max: null };
  const nums = [...v.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => parseMoney(m[1])).filter((n): n is number => n != null);
  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return /up to|maximum|max/i.test(v) ? { min: null, max: nums[0]! } : { min: nums[0]!, max: nums[0]! };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export function parseCaDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.trim().replace(" ", "T") + (v.trim().length <= 19 ? "Z" : ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeCaRecord(rec: CaRecord, sourceId: string): NormalizedOpportunity {
  const applicantText = `${rec.ApplicantType ?? ""} ${rec.ApplicantTypeNotes ?? ""}`;
  const entityTypes = [...new Set(APPLICANT_MAP.filter(([re]) => re.test(applicantText)).map(([, t]) => t))];
  const seedCats = CA_CATEGORY_MAP.filter(([re]) => re.test(rec.Categories ?? "")).map(([, c]) => c);
  const summary = stripHtml([rec.Purpose, rec.Description].filter(Boolean).join("\n\n"));
  const categories = inferCategories(`${rec.Title} ${summary ?? ""}`, seedCats);
  const range = parseAmountRange(rec.EstAmounts);
  const deadline = parseCaDate(rec.ApplicationDeadline);
  const status = rec.Status?.toLowerCase() === "forecasted" ? "forecasted" : rec.Status?.toLowerCase() === "active" ? "open" : "closed";

  return normalizedOpportunitySchema.parse({
    sourceId,
    externalId: rec.PortalID,
    title: stripHtml(rec.Title) ?? rec.Title,
    agency: rec.AgencyDept ?? null,
    level: "state",
    states: ["CA"],
    entityTypes,
    categories: categories.length ? categories : ["other"],
    summary,
    eligibilityText: stripHtml(rec.ApplicantTypeNotes),
    amountMin: range.min,
    amountMax: range.max,
    totalFunding: parseAmountRange(rec.EstAvailFunds).max,
    postedAt: parseCaDate(rec.OpenDate),
    deadline,
    deadlineText: deadline ? null : rec.ApplicationDeadline?.trim() || null,
    applyUrl: rec.GrantURL && /^https?:\/\//i.test(rec.GrantURL) ? rec.GrantURL.trim() : PORTAL_URL(rec.PortalID),
    status,
    raw: rec,
  });
}

export class CaGrantsSource implements SourceAdapter {
  constructor(public readonly config: CaGrantsSourceConfig) {}

  async fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]> {
    const resource = this.config.resourceId ?? DEFAULT_RESOURCE;
    const limit = 200;
    const out: NormalizedOpportunity[] = [];
    for (let offset = 0; offset < ctx.maxItems; offset += limit) {
      const url = `${API}?resource_id=${resource}&limit=${limit}&offset=${offset}&filters=${encodeURIComponent(
        JSON.stringify({ Status: ["active", "forecasted"] }),
      )}`;
      const res = await fetchWithRetry(
        url,
        { headers: { accept: "application/json" }, fetchImpl: ctx.fetchImpl },
        { onRetry: (err, attempt, delay) => ctx.log.warn({ err, attempt, delay }, "ca grants retry") },
      );
      const body = caResponseSchema.parse(await res.json());
      for (const raw of body.result.records) {
        const parsed = caRecordSchema.safeParse(raw);
        if (!parsed.success) {
          ctx.log.warn({ issues: parsed.error.issues.slice(0, 3) }, "ca record skipped: invalid shape");
          continue;
        }
        try {
          out.push(normalizeCaRecord(parsed.data, this.config.id));
        } catch (err) {
          ctx.log.warn({ err, id: parsed.data.PortalID }, "ca record failed normalisation");
        }
      }
      if (offset + limit >= body.result.total || body.result.records.length === 0) break;
    }
    return out;
  }
}
