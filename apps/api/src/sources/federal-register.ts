import { z } from "zod";
import { fetchWithRetry } from "../lib/retry.js";
import {
  inferCategories,
  inferFundingTypes,
  inferStates,
  normalizedOpportunitySchema,
  stripHtml,
  type EntityType,
  type FundingType,
  type NormalizedOpportunity,
} from "../domain/opportunity.js";
import { extractDeadline } from "./rss.js";
import type { FederalRegisterSourceConfig, SourceAdapter, SourceContext } from "./types.js";

const API = "https://www.federalregister.gov/api/v1/documents.json";
// federalregister.gov rejects requests without a browser-like or identifying user agent.
const HEADERS = { accept: "application/json", "user-agent": "GrantRetriever/1.0 (+https://www.grantretriever.com)" };
const FIELDS = ["title", "abstract", "action", "agencies", "dates", "document_number", "html_url", "publication_date", "raw_text_url"];

export const DEFAULT_INCLUDE_TITLE =
  "funding opportunit|funding availability|solicitation of applications|inviting applications|request for applications|accepting applications|application (window|period)|availability of funds|loan|guarantee|grant program|declaration of a (major )?disaster|disaster declaration";
export const DEFAULT_EXCLUDE_TITLE =
  "information collection|waiver|intent to award|rescission|recission|meeting|comment request|system of records|privacy act|environmental (impact|assessment)|scoping|finding of no|record of decision|withdrawal|sunshine|delegation|correction|amendment|fees\\b|adjustment|list of requests|notices of emergency|advisory|guidance|test environment|annual notice of guarantee fee|proposed";

const agencySchema = z.object({ name: z.string().nullable().optional(), raw_name: z.string().nullable().optional(), slug: z.string().nullable().optional() });

export const frDocumentSchema = z.object({
  document_number: z.string(),
  title: z.string(),
  abstract: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  dates: z.string().nullable().optional(),
  agencies: z.array(agencySchema).default([]),
  html_url: z.string().url(),
  publication_date: z.string(),
  raw_text_url: z.string().url().nullable().optional(),
});
export type FrDocument = z.infer<typeof frDocumentSchema>;

export const frResponseSchema = z.object({
  count: z.number(),
  total_pages: z.number().optional(),
  results: z.array(z.unknown()).default([]),
});

export function keepDocument(doc: FrDocument, cfg: FederalRegisterSourceConfig): boolean {
  const text = `${doc.title} ${doc.action ?? ""}`;
  if (!new RegExp(cfg.includeTitle ?? DEFAULT_INCLUDE_TITLE, "i").test(text)) return false;
  if (new RegExp(cfg.excludeTitle ?? DEFAULT_EXCLUDE_TITLE, "i").test(doc.title)) return false;
  if (/\bcorrection\b/i.test(doc.action ?? "")) return false;
  return true;
}

/** Notices whose full announcement is posted on Grants.gov are already indexed from the Grants.gov API. */
export function duplicatesGrantsGov(fullText: string): boolean {
  const head = fullText.split(/SUPPLEMENTARY INFORMATION/)[0] ?? fullText;
  return /\bgrants\.gov\b/i.test(head);
}

/** The "DATES:" paragraph of the full notice, where application deadlines are stated. */
export function datesSection(fullText: string): string | null {
  const m = /\bDATES?:\s*([\s\S]*?)(?=\n\s*(?:ADDRESSES|FOR FURTHER INFORMATION|SUPPLEMENTARY INFORMATION)\b|$)/.exec(fullText);
  return m?.[1] ? m[1].replace(/\s+/g, " ").trim() : null;
}

/** SBA disaster notices list separate physical and economic-injury loan deadlines; the later one is when the window closes. */
function sbaDeadlines(text: string): { deadline: Date | null; deadlineText: string | null } {
  const found = [...text.matchAll(/([A-Za-z() ]*?Loan Application Deadline Date):\s*([A-Z][a-z]+\.? \d{1,2}, \d{4})/g)];
  if (!found.length) return { deadline: null, deadlineText: null };
  const dates = found.map((m) => new Date(`${m[2]} 23:59:59 UTC`)).filter((d) => !Number.isNaN(d.getTime()));
  if (!dates.length) return { deadline: null, deadlineText: null };
  const deadline = new Date(Math.max(...dates.map((d) => d.getTime())));
  const deadlineText = found.map((m) => `${m[1]!.trim()}: ${m[2]}`).join(" · ").slice(0, 300);
  return { deadline, deadlineText };
}

export function normalizeFrDocument(doc: FrDocument, fullText: string | null, cfg: FederalRegisterSourceConfig): NormalizedOpportunity {
  const title = stripHtml(doc.title) ?? doc.title;
  const summary = stripHtml(doc.abstract);
  const isDisaster = /disaster/i.test(title);
  const isSba = doc.agencies.some((a) => a.slug === "small-business-administration");
  const dates = (fullText && datesSection(fullText)) ?? doc.dates ?? "";
  let { deadline, deadlineText } = isSba ? sbaDeadlines(dates) : { deadline: null as Date | null, deadlineText: null as string | null };
  if (!deadline) ({ deadline, deadlineText } = extractDeadline(dates));
  if (!deadline && /until funds are exhausted|accepted on a continuous basis|rolling/i.test(dates)) deadlineText = "Rolling — until funds are exhausted";

  const agencies = doc.agencies.filter((a) => a.name);
  const specific = agencies.find((a) => a.slug && cfg.agencies.includes(a.slug)) ?? agencies[agencies.length - 1];
  // SBA disaster loans are filed under disaster aid only, so the Loans filter stays about program lending.
  const fundingTypes: FundingType[] = isDisaster ? ["disaster_aid"] : inferFundingTypes(title, summary);
  const entityTypes: EntityType[] = !(isDisaster && isSba)
    ? []
    : /public assistance only/i.test(title)
      ? ["nonprofit"]
      : ["small_business", "nonprofit", "individual"];
  // Disaster notices are for one state ("…for the State of Texas"); funding notices are usually nationwide.
  const states = isDisaster ? inferStates(title) : [];
  const categories = inferCategories(`${title} ${summary ?? ""}`);
  const publishedAt = new Date(`${doc.publication_date}T00:00:00Z`);

  return normalizedOpportunitySchema.parse({
    sourceId: cfg.id,
    externalId: doc.document_number,
    title,
    agency: specific?.name ?? null,
    level: "federal",
    states,
    entityTypes,
    categories: categories.length ? categories : ["other"],
    fundingTypes,
    summary,
    eligibilityText: null,
    amountMin: null,
    amountMax: null,
    totalFunding: null,
    postedAt: Number.isNaN(publishedAt.getTime()) ? null : publishedAt,
    deadline,
    deadlineText,
    applyUrl: doc.html_url,
    status: deadline && deadline < new Date() ? "closed" : "open",
    raw: { document_number: doc.document_number, action: doc.action, dates: doc.dates },
  });
}

export function searchUrl(cfg: FederalRegisterSourceConfig, page: number, now = new Date()): string {
  const since = new Date(now.getTime() - (cfg.lookbackDays ?? 270) * 86_400_000).toISOString().slice(0, 10);
  const q = new URLSearchParams({ per_page: "1000", page: String(page), order: "newest" });
  q.append("conditions[type][]", "NOTICE");
  q.append("conditions[publication_date][gte]", since);
  for (const a of cfg.agencies) q.append("conditions[agencies][]", a);
  for (const f of FIELDS) q.append("fields[]", f);
  return `${API}?${q.toString()}`;
}

export class FederalRegisterSource implements SourceAdapter {
  constructor(public readonly config: FederalRegisterSourceConfig) {}

  async fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]> {
    const kept: FrDocument[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetchWithRetry(
        searchUrl(this.config, page),
        { headers: HEADERS, fetchImpl: ctx.fetchImpl },
        { onRetry: (err, attempt, delay) => ctx.log.warn({ err, attempt, delay, page }, "federal register search retry") },
      );
      const body = frResponseSchema.parse(await res.json());
      for (const raw of body.results) {
        const parsed = frDocumentSchema.safeParse(raw);
        if (!parsed.success) {
          ctx.log.warn({ issues: parsed.error.issues.slice(0, 3) }, "federal register document skipped: invalid shape");
          continue;
        }
        if (keepDocument(parsed.data, this.config)) kept.push(parsed.data);
      }
      if (page >= (body.total_pages ?? 1) || body.results.length === 0) break;
    }
    ctx.log.info({ source: this.config.id, kept: kept.length }, "federal register search complete");

    const out: NormalizedOpportunity[] = [];
    for (const doc of kept.slice(0, ctx.maxItems)) {
      let fullText: string | null = null;
      if (this.config.fetchDetails !== false && doc.raw_text_url) {
        try {
          const res = await fetchWithRetry(doc.raw_text_url, { headers: { ...HEADERS, accept: "text/html" }, fetchImpl: ctx.fetchImpl });
          fullText = stripHtml(await res.text());
          if (fullText && duplicatesGrantsGov(fullText)) continue;
        } catch (err) {
          ctx.log.warn({ err, doc: doc.document_number }, "federal register full text failed; using API summary");
        }
      }
      try {
        out.push(normalizeFrDocument(doc, fullText, this.config));
      } catch (err) {
        ctx.log.warn({ err, doc: doc.document_number }, "federal register document failed normalisation");
      }
    }
    return out;
  }
}
