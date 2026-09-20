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

export type SourceConfig = GrantsGovSourceConfig | RssSourceConfig | CaGrantsSourceConfig | WpRestSourceConfig;

export interface SourceAdapter {
  readonly config: SourceConfig;
  fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]>;
}
