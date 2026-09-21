import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchWithRetry } from "../lib/retry.js";
import {
  CATEGORIES,
  ENTITY_TYPES,
  inferCategories,
  normalizedOpportunitySchema,
  stripHtml,
  type Category,
  type EntityType,
  type NormalizedOpportunity,
} from "../domain/opportunity.js";
import { extractDeadline } from "./rss.js";
import type { HtmlListSourceConfig, SourceAdapter, SourceContext } from "./types.js";

/**
 * Generic scraper for agency "program catalogue" pages: a listing page (or a
 * few of them, optionally paginated) where every program is one repeated
 * element with a title, a link and usually a short blurb. Selectors live in
 * sources.json so adding a state is config-only unless the page needs a new
 * extraction mode.
 */
export const HTML_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; GrantRetriever/1.0; +https://grantretriever.com)",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
};

const MAX_PAGES_DEFAULT = 20;

export interface HtmlListItem {
  title: string;
  link: string;
  summary: string | null;
  meta: string | null;
}

function text($el: Cheerio<AnyNode>): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

function pick($item: Cheerio<AnyNode>, selector: string | undefined): Cheerio<AnyNode> {
  if (!selector) return $item;
  return $item.is(selector) ? $item : $item.find(selector).first();
}

/** Text of the siblings that follow `$item` up to (not including) the next element matching `stop`. */
function followingText($item: Cheerio<AnyNode>, stop: string): string | null {
  const parts: string[] = [];
  let $cur = $item.next();
  while ($cur.length && !$cur.is(stop)) {
    const t = text($cur);
    if (t) parts.push(t);
    $cur = $cur.next();
  }
  return parts.length ? parts.join("\n") : null;
}

export function extractItems(html: string, pageUrl: string, cfg: HtmlListSourceConfig): HtmlListItem[] {
  const $ = cheerio.load(html);
  const out: HtmlListItem[] = [];
  $(cfg.itemSelector).each((_, el) => {
    const $item = $(el);
    const $title = pick($item, cfg.titleSelector);
    const $link = cfg.linkSelector ? pick($item, cfg.linkSelector) : $title.is("a") ? $title : $title.find("a").first();
    const href = ($link.attr("href") ?? $item.find("a[href]").first().attr("href") ?? "").trim();
    const title = text($title).replace(/^\s*(learn more|read more)\s*$/i, "");
    if (!href || !title || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    let link: string;
    try {
      link = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    const summaryHtml = cfg.summaryFollowing
      ? null
      : cfg.summarySelector
        ? $item.find(cfg.summarySelector).first().html()
        : null;
    const summary = cfg.summaryFollowing ? followingText($item, cfg.itemSelector) : stripHtml(summaryHtml ?? "");
    const meta = cfg.metaSelector ? text($item.find(cfg.metaSelector).first()) || null : null;
    out.push({ title, link, summary: summary?.slice(0, 1500) || null, meta });
  });
  return out;
}

export function keepItem(item: HtmlListItem, cfg: HtmlListSourceConfig): boolean {
  const haystack = `${item.title} ${item.meta ?? ""}`;
  if (cfg.excludeTitle && new RegExp(cfg.excludeTitle, "i").test(haystack)) return false;
  if (cfg.includeTitle && !new RegExp(cfg.includeTitle, "i").test(haystack)) return false;
  if (cfg.excludeLink && new RegExp(cfg.excludeLink, "i").test(item.link)) return false;
  if (cfg.includeLink && !new RegExp(cfg.includeLink, "i").test(item.link)) return false;
  return true;
}

export function itemKey(item: HtmlListItem): string {
  return `${item.link}\n${item.title.toLowerCase()}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Several programs on one catalogue page may point at the same detail URL, so the
 * external id is the link alone unless `sharedLink` is set, in which case the title is
 * appended to keep (source_id, external_id) unique.
 */
export function normalizeHtmlItem(
  item: HtmlListItem,
  cfg: HtmlListSourceConfig,
  opts: { sharedLink?: boolean } = {},
): NormalizedOpportunity {
  const text = `${item.title} ${item.summary ?? ""}`;
  const { deadline, deadlineText } = extractDeadline(text);
  const seedCats = (cfg.defaultCategories ?? []).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const entityTypes = (cfg.defaultEntityTypes ?? []).filter((e): e is EntityType =>
    (ENTITY_TYPES as readonly string[]).includes(e),
  );
  const categories = inferCategories(`${text} ${item.meta ?? ""}`, seedCats);

  return normalizedOpportunitySchema.parse({
    sourceId: cfg.id,
    externalId: opts.sharedLink ? `${item.link}#${slugify(item.title)}` : item.link,
    title: item.title,
    agency: cfg.agency ?? null,
    level: cfg.level,
    states: cfg.states,
    entityTypes,
    categories: categories.length ? categories : ["other"],
    summary: item.summary,
    eligibilityText: null,
    amountMin: null,
    amountMax: null,
    totalFunding: null,
    postedAt: null,
    deadline,
    deadlineText,
    applyUrl: item.link,
    status: deadline && deadline < new Date() ? "closed" : "open",
    raw: { link: item.link, meta: item.meta },
  });
}

export function pageUrl(base: string, cfg: HtmlListSourceConfig, page: number): string {
  if (!cfg.pagination) return base;
  const u = new URL(base);
  u.searchParams.set(cfg.pagination.param, String(page));
  return u.toString();
}

export class HtmlListSource implements SourceAdapter {
  constructor(public readonly config: HtmlListSourceConfig) {}

  async fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]> {
    const cfg = this.config;
    const seen = new Set<string>();
    const linkCount = new Map<string, number>();
    const kept: HtmlListItem[] = [];
    const first = cfg.pagination?.first ?? 0;
    const maxPages = cfg.pagination ? (cfg.pagination.maxPages ?? MAX_PAGES_DEFAULT) : 1;

    for (const base of cfg.urls) {
      for (let page = first; page < first + maxPages && kept.length < ctx.maxItems; page++) {
        const url = pageUrl(base, cfg, page);
        const res = await fetchWithRetry(
          url,
          { headers: HTML_HEADERS, fetchImpl: ctx.fetchImpl },
          { onRetry: (err, attempt, delay) => ctx.log.warn({ err, attempt, delay, url }, "html-list retry") },
        );
        const items = extractItems(await res.text(), url, cfg);
        let fresh = 0;
        for (const item of items) {
          const key = itemKey(item);
          if (seen.has(key)) continue;
          seen.add(key);
          fresh++;
          if (!keepItem(item, cfg)) continue;
          linkCount.set(item.link, (linkCount.get(item.link) ?? 0) + 1);
          kept.push(item);
        }
        if (items.length === 0 && page === first) {
          ctx.log.warn({ url }, "html-list page yielded no items; selectors may be stale");
        }
        if (fresh === 0) break;
      }
    }

    const out: NormalizedOpportunity[] = [];
    for (const item of kept) {
      try {
        out.push(normalizeHtmlItem(item, cfg, { sharedLink: (linkCount.get(item.link) ?? 0) > 1 }));
      } catch (err) {
        ctx.log.warn({ err, title: item.title }, "html-list item failed normalisation");
      }
    }
    return out.slice(0, ctx.maxItems);
  }
}
