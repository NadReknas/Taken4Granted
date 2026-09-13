import { z } from "zod";

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

export const STATE_CODES = Object.keys(US_STATES) as [string, ...string[]];

/** Normalised entity types shared by ingestion, alert criteria and the UI. */
export const ENTITY_TYPES = [
  "small_business",
  "for_profit",
  "nonprofit",
  "individual",
  "local_government",
  "state_government",
  "tribal",
  "education",
  "agricultural_producer",
  "any",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  small_business: "Small business",
  for_profit: "For-profit (any size)",
  nonprofit: "Nonprofit",
  individual: "Individual",
  local_government: "City / county government",
  state_government: "State government",
  tribal: "Tribal government / organization",
  education: "School / university",
  agricultural_producer: "Farm / agricultural producer",
  any: "Unrestricted",
};

export const CATEGORIES = [
  "energy",
  "environment",
  "agriculture",
  "rural_development",
  "business",
  "community_development",
  "infrastructure",
  "natural_resources",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LEVELS = ["federal", "state", "local", "other"] as const;
export const STATUSES = ["open", "closed", "forecasted"] as const;

export const MAX_TEXT = 5000;

const money = z.number().nonnegative().finite().nullable();

/** Canonical shape every source adapter must produce. Validated before indexing. */
export const normalizedOpportunitySchema = z
  .object({
    sourceId: z.string().min(1),
    externalId: z.string().min(1),
    title: z.string().trim().min(3).max(500),
    agency: z.string().trim().max(300).nullable(),
    level: z.enum(LEVELS),
    states: z.array(z.enum(STATE_CODES)).default([]),
    entityTypes: z.array(z.enum(ENTITY_TYPES)).default([]),
    categories: z.array(z.enum(CATEGORIES)).default([]),
    summary: z.string().trim().max(MAX_TEXT).nullable(),
    eligibilityText: z.string().trim().max(MAX_TEXT).nullable(),
    amountMin: money,
    amountMax: money,
    totalFunding: money,
    postedAt: z.date().nullable(),
    deadline: z.date().nullable(),
    deadlineText: z.string().max(300).nullable(),
    applyUrl: z.string().url(),
    status: z.enum(STATUSES).default("open"),
    raw: z.unknown().optional(),
  })
  .refine((o) => o.amountMin == null || o.amountMax == null || o.amountMin <= o.amountMax, {
    message: "amountMin must be <= amountMax",
    path: ["amountMin"],
  });

export type NormalizedOpportunity = z.infer<typeof normalizedOpportunitySchema>;

export interface OpportunityRow {
  id: string;
  source_id: string;
  external_id: string;
  slug: string;
  title: string;
  agency: string | null;
  level: string;
  states: string[];
  entity_types: string[];
  categories: string[];
  summary: string | null;
  eligibility_text: string | null;
  amount_min: string | null;
  amount_max: string | null;
  total_funding: string | null;
  posted_at: Date | null;
  deadline: Date | null;
  deadline_text: string | null;
  apply_url: string;
  status: string;
  first_seen_at: Date;
  last_seen_at: Date;
  updated_at: Date;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/-$/, "");
}

export function buildSlug(o: Pick<NormalizedOpportunity, "title" | "externalId">): string {
  const base = slugify(o.title) || "opportunity";
  const ext = slugify(o.externalId).slice(0, 40) || "x";
  return `${base}-${ext}`;
}

export function clip(text: string | null, max = MAX_TEXT): string | null {
  if (text == null) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Converts source HTML to plain text and clips to the schema limit. */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length ? clip(text) : null;
}

export function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).replace(/[$,\s]/g, "");
  if (!s || /^(none|n\/?a|tbd)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["energy", /\b(energy|solar|wind|renewable|efficien|electrif|battery|geothermal|biofuel|hydrogen)\b/i],
  ["environment", /\b(environment|climate|sustainab|emission|pollution|conservation|water|resilien|recycl)\b/i],
  ["agriculture", /\b(agricultur|farm|ranch|crop|livestock|producer|food system|usda)\b/i],
  ["rural_development", /\b(rural)\b/i],
  ["business", /\b(business|entrepreneur|small business|commerc|manufactur|economic development)\b/i],
  ["community_development", /\b(community development|community facilit|housing|neighborhood)\b/i],
  ["infrastructure", /\b(infrastructure|broadband|transportation|transit|utility|utilities|grid)\b/i],
  ["natural_resources", /\b(forest|natural resource|wildlife|land|watershed|fisher)\b/i],
];

export function inferCategories(text: string, seed: Category[] = []): Category[] {
  const out = new Set<Category>(seed);
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(text)) out.add(cat);
  return [...out];
}

export function inferStates(text: string): string[] {
  const found = new Set<string>();
  for (const [code, name] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) found.add(code);
  }
  return [...found];
}
