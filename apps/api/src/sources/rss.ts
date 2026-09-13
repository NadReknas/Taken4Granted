import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { fetchWithRetry } from "../lib/retry.js";
import {
  ENTITY_TYPES,
  CATEGORIES,
  inferCategories,
  inferStates,
  normalizedOpportunitySchema,
  stripHtml,
  type Category,
  type EntityType,
  type NormalizedOpportunity,
} from "../domain/opportunity.js";
import type { RssSourceConfig, SourceAdapter, SourceContext } from "./types.js";

const textish = z
  .union([z.string(), z.number(), z.object({ "#text": z.union([z.string(), z.number()]) }).passthrough()])
  .transform((v) => (typeof v === "object" ? String(v["#text"]) : String(v)));

const linkish = z
  .union([
    z.string(),
    z.object({ "@_href": z.string() }).passthrough(),
    z.array(z.union([z.string(), z.object({ "@_href": z.string() }).passthrough()])),
  ])
  .transform((v) => {
    const first = Array.isArray(v) ? v[0] : v;
    if (!first) return "";
    return typeof first === "string" ? first : first["@_href"];
  });

export const rssItemSchema = z
  .object({
    title: textish,
    link: linkish,
    guid: textish.optional(),
    id: textish.optional(),
    description: textish.optional(),
    summary: textish.optional(),
    content: textish.optional(),
    "content:encoded": textish.optional(),
    pubDate: textish.optional(),
    published: textish.optional(),
    updated: textish.optional(),
    "dc:date": textish.optional(),
  })
  .passthrough();
export type RssItem = z.infer<typeof rssItemSchema>;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: false, trimValues: true });

export function extractItems(xml: string): unknown[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc["rss"] as { channel?: { item?: unknown } } | undefined;
  const feed = doc["feed"] as { entry?: unknown } | undefined;
  const raw = rss?.channel?.item ?? feed?.entry ?? [];
  return Array.isArray(raw) ? raw : [raw];
}

const DEADLINE_RE =
  /(?:deadline|due|close[sd]?|applications? (?:are )?due|apply by)[^.\n]{0,40}?(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i;

export function extractDeadline(text: string): { deadline: Date | null; deadlineText: string | null } {
  const m = DEADLINE_RE.exec(text);
  if (!m?.[1]) return { deadline: null, deadlineText: null };
  const d = new Date(m[1]);
  if (Number.isNaN(d.getTime())) return { deadline: null, deadlineText: m[0].slice(0, 300) };
  d.setUTCHours(23, 59, 59, 0);
  return { deadline: d, deadlineText: m[0].slice(0, 300) };
}

export function normalizeRssItem(item: RssItem, cfg: RssSourceConfig): NormalizedOpportunity {
  const html = item["content:encoded"] ?? item.content ?? item.description ?? item.summary ?? "";
  const summary = stripHtml(html);
  const text = `${item.title} ${summary ?? ""}`;
  const dateStr = item.pubDate ?? item.published ?? item.updated ?? item["dc:date"];
  const postedAt = dateStr ? new Date(dateStr) : null;
  const { deadline, deadlineText } = extractDeadline(text);
  const states = cfg.states?.length ? cfg.states : inferStates(text);
  const seedCats = (cfg.defaultCategories ?? []).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const entityTypes = (cfg.defaultEntityTypes ?? []).filter((e): e is EntityType =>
    (ENTITY_TYPES as readonly string[]).includes(e),
  );
  const categories = inferCategories(text, seedCats);

  return normalizedOpportunitySchema.parse({
    sourceId: cfg.id,
    externalId: item.guid ?? item.id ?? item.link,
    title: stripHtml(item.title) ?? item.title,
    agency: cfg.agency ?? null,
    level: cfg.level,
    states,
    entityTypes,
    categories: categories.length ? categories : ["other"],
    summary,
    eligibilityText: null,
    amountMin: null,
    amountMax: null,
    totalFunding: null,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    deadline,
    deadlineText,
    applyUrl: item.link,
    status: deadline && deadline < new Date() ? "closed" : "open",
    raw: item,
  });
}

export class RssSource implements SourceAdapter {
  constructor(public readonly config: RssSourceConfig) {}

  async fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]> {
    const res = await fetchWithRetry(
      this.config.url,
      { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, fetchImpl: ctx.fetchImpl },
      { onRetry: (err, attempt, delay) => ctx.log.warn({ err, attempt, delay, url: this.config.url }, "rss retry") },
    );
    const xml = await res.text();
    const out: NormalizedOpportunity[] = [];
    for (const raw of extractItems(xml).slice(0, ctx.maxItems)) {
      const parsed = rssItemSchema.safeParse(raw);
      if (!parsed.success) {
        ctx.log.warn({ issues: parsed.error.issues }, "rss item skipped: invalid shape");
        continue;
      }
      try {
        out.push(normalizeRssItem(parsed.data, this.config));
      } catch (err) {
        ctx.log.warn({ err, title: parsed.data.title }, "rss item failed normalisation");
      }
    }
    return out;
  }
}
