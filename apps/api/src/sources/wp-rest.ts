import { z } from "zod";
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
import type { SourceAdapter, SourceContext, WpRestSourceConfig } from "./types.js";

/**
 * Many state agencies run WordPress and expose their program catalogue as a
 * custom post type (e.g. `program`). The REST API returns the full catalogue
 * (RSS feeds cap at 10 items), paged 100 at a time.
 */
const rendered = z.object({ rendered: z.string() });

export const wpPostSchema = z
  .object({
    id: z.number(),
    date_gmt: z.string().nullable().optional(),
    modified_gmt: z.string().nullable().optional(),
    link: z.string(),
    title: rendered,
    content: rendered.optional(),
    excerpt: rendered.optional(),
  })
  .passthrough();
export type WpPost = z.infer<typeof wpPostSchema>;

const PER_PAGE = 100;
const MAX_PAGES = 10;

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.endsWith("Z") ? v : `${v}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function keepPost(post: WpPost, cfg: WpRestSourceConfig): boolean {
  const title = stripHtml(post.title.rendered) ?? post.title.rendered;
  if (cfg.excludeTitle && new RegExp(cfg.excludeTitle, "i").test(title)) return false;
  if (cfg.includeTitle && !new RegExp(cfg.includeTitle, "i").test(title)) return false;
  return true;
}

export function normalizeWpPost(post: WpPost, cfg: WpRestSourceConfig): NormalizedOpportunity {
  const title = stripHtml(post.title.rendered) ?? post.title.rendered;
  const body = stripHtml(post.content?.rendered ?? "") ?? "";
  const excerpt = stripHtml(post.excerpt?.rendered ?? "") ?? "";
  const summary = (excerpt || body).slice(0, 1500) || null;
  const text = `${title} ${body}`;
  const { deadline, deadlineText } = extractDeadline(text);
  const seedCats = (cfg.defaultCategories ?? []).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const entityTypes = (cfg.defaultEntityTypes ?? []).filter((e): e is EntityType =>
    (ENTITY_TYPES as readonly string[]).includes(e),
  );
  const categories = inferCategories(text, seedCats);

  return normalizedOpportunitySchema.parse({
    sourceId: cfg.id,
    externalId: String(post.id),
    title,
    agency: cfg.agency ?? null,
    level: cfg.level,
    states: cfg.states,
    entityTypes,
    categories: categories.length ? categories : ["other"],
    summary,
    eligibilityText: null,
    amountMin: null,
    amountMax: null,
    totalFunding: null,
    postedAt: toDate(post.modified_gmt) ?? toDate(post.date_gmt),
    deadline,
    deadlineText,
    applyUrl: post.link,
    status: deadline && deadline < new Date() ? "closed" : "open",
    raw: { id: post.id, link: post.link, modified_gmt: post.modified_gmt },
  });
}

export class WpRestSource implements SourceAdapter {
  constructor(public readonly config: WpRestSourceConfig) {}

  async fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]> {
    const out: NormalizedOpportunity[] = [];
    const base = this.config.siteUrl.replace(/\/+$/, "");
    for (let page = 1; page <= MAX_PAGES && out.length < ctx.maxItems; page++) {
      const url = `${base}/wp-json/wp/v2/${this.config.postType}?per_page=${PER_PAGE}&page=${page}&_fields=id,date_gmt,modified_gmt,link,title,content,excerpt`;
      const res = await fetchWithRetry(
        url,
        { headers: { accept: "application/json" }, fetchImpl: ctx.fetchImpl },
        { onRetry: (err, attempt, delay) => ctx.log.warn({ err, attempt, delay, url }, "wp-rest retry") },
      );
      const posts = z.array(z.unknown()).parse(await res.json());
      for (const raw of posts) {
        const parsed = wpPostSchema.safeParse(raw);
        if (!parsed.success) {
          ctx.log.warn({ issues: parsed.error.issues }, "wp-rest post skipped: invalid shape");
          continue;
        }
        if (!keepPost(parsed.data, this.config)) continue;
        try {
          out.push(normalizeWpPost(parsed.data, this.config));
        } catch (err) {
          ctx.log.warn({ err, title: parsed.data.title.rendered }, "wp-rest post failed normalisation");
        }
      }
      const totalPages = Number(res.headers.get("x-wp-totalpages") ?? 1);
      if (page >= totalPages) break;
    }
    return out.slice(0, ctx.maxItems);
  }
}
