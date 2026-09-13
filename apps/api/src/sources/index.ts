import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { GrantsGovSource } from "./grants-gov.js";
import { RssSource } from "./rss.js";
import { CaGrantsSource } from "./ca-grants.js";
import type { SourceAdapter, SourceConfig } from "./types.js";
import { STATE_CODES } from "../domain/opportunity.js";

const base = { id: z.string().regex(/^[a-z0-9_-]+$/), name: z.string(), enabled: z.boolean().optional() };

export const sourceConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("grants_gov"),
    keywords: z.array(z.string()).optional(),
    fundingCategories: z.array(z.string()).optional(),
    eligibilities: z.array(z.string()).optional(),
    fetchDetails: z.boolean().optional(),
  }),
  z.object({ ...base, kind: z.literal("ca_grants"), resourceId: z.string().optional() }),
  z.object({
    ...base,
    kind: z.literal("rss"),
    url: z.string().url(),
    level: z.enum(["state", "local", "other"]),
    states: z.array(z.enum(STATE_CODES)).optional(),
    agency: z.string().optional(),
    defaultEntityTypes: z.array(z.string()).optional(),
    defaultCategories: z.array(z.string()).optional(),
  }),
]);

export const sourcesFileSchema = z.object({ sources: z.array(sourceConfigSchema) });

export function buildAdapter(cfg: SourceConfig): SourceAdapter {
  switch (cfg.kind) {
    case "grants_gov":
      return new GrantsGovSource(cfg);
    case "rss":
      return new RssSource(cfg);
    case "ca_grants":
      return new CaGrantsSource(cfg);
  }
}

export async function loadSources(file?: string): Promise<SourceAdapter[]> {
  const p = file ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../config/sources.json");
  const parsed = sourcesFileSchema.parse(JSON.parse(await readFile(p, "utf8")));
  return parsed.sources.filter((s) => s.enabled !== false).map(buildAdapter);
}
