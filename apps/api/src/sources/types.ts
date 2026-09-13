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

export type SourceConfig = GrantsGovSourceConfig | RssSourceConfig | CaGrantsSourceConfig;

export interface SourceAdapter {
  readonly config: SourceConfig;
  fetch(ctx: SourceContext): Promise<NormalizedOpportunity[]>;
}
