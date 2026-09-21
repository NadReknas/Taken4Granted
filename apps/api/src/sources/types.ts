import type { Logger } from "../lib/logger.js";
import type { NormalizedOpportunity } from "../domain/opportunity.js";

export interface SourceContext {
  log: Logger;
  maxItems: number;
  fetchImpl?: typeof fetch;
}

export interface SourceConfigBase {
  id: string;
  name: string;
  enabled?: boolean;
}

export interface GrantsGovSourceConfig extends SourceConfigBase {
  kind: "grants_gov";
  keywords?: string[];
  fundingCategories?: string[];
  eligibilities?: string[];
  fetchDetails?: boolean;
}

export interface RssSourceConfig extends SourceConfigBase {
  kind: "rss";
  url: string;
  level: "state" | "local" | "other";
  states?: string[];
  agency?: string;
  defaultEntityTypes?: string[];
  defaultCategories?: string[];
}

export interface CaGrantsSourceConfig extends SourceConfigBase {
  kind: "ca_grants";
  resourceId?: string;
}

export interface WpRestSourceConfig extends SourceConfigBase {
  kind: "wp_rest";
  /** WordPress site root, e.g. https://sdgoed.com */
  siteUrl: string;
  /** REST post type slug, e.g. "program" */
  postType: string;
  level: "state" | "local" | "other";
  states: string[];
  agency?: string;
  /** Case-insensitive regex; posts whose title doesn't match are dropped. */
  includeTitle?: string;
  /** Case-insensitive regex; posts whose title matches are dropped. */
  excludeTitle?: string;
  defaultEntityTypes?: string[];
  defaultCategories?: string[];
}

export interface HtmlListSourceConfig extends SourceConfigBase {
  kind: "html_list";
  /** Listing pages to scrape; items are de-duplicated by link across pages. */
  urls: string[];
  /** CSS selector matching one program per element. */
  itemSelector: string;
  /** Relative to the item; defaults to the item itself. */
  titleSelector?: string;
  /** Relative to the item; defaults to the title element (or its first <a>). */
  linkSelector?: string;
  /** Relative to the item. */
  summarySelector?: string;
  /** Use the text of the siblings following the item (up to the next item) as the summary — for "<h3><a>…</a></h3><p>…</p>" layouts. */
  summaryFollowing?: boolean;
  /** Relative to the item; a type/category label included in title filtering and category inference. */
  metaSelector?: string;
  /** Adds `?param=N` to each URL, starting at `first`, until a page yields no new items. */
  pagination?: { param: string; first?: number; maxPages?: number };
  level: "state" | "local" | "other";
  states: string[];
  agency?: string;
  /** Case-insensitive regexes over "title + meta" / the resolved link. */
  includeTitle?: string;
  excludeTitle?: string;
  includeLink?: string;
  excludeLink?: string;
  defaultEntityTypes?: string[];
  defaultCategories?: string[];
}

export type SourceConfig =
  | GrantsGovSourceConfig
  | RssSourceConfig
  | CaGrantsSourceConfig
  | WpRestSourceConfig
  | HtmlListSourceConfig;

export interface SourceAdapter {
  readonly config: SourceConfig;
  fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]>;
}
