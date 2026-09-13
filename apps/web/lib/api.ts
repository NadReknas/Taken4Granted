export interface Opportunity {
  id: string;
  source_id: string;
  external_id: string;
  slug: string;
  title: string;
  agency: string | null;
  level: "federal" | "state" | "local";
  states: string[];
  entity_types: string[];
  categories: string[];
  summary: string | null;
  eligibility_text: string | null;
  amount_min: string | null;
  amount_max: string | null;
  total_funding: string | null;
  posted_at: string | null;
  deadline: string | null;
  deadline_text: string | null;
  apply_url: string;
  status: "open" | "forecasted" | "closed";
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

export interface SearchResult {
  items: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Meta {
  states: Record<string, string>;
  entityTypes: Array<{ value: string; label: string }>;
  categories: string[];
  levels: string[];
}

export interface Stats {
  open: number;
  closingSoon: number;
  addedThisWeek: number;
  sources: Array<{ id: string; name: string; last_run_at: string | null; last_status: string | null; last_count: number | null }>;
}

export interface Alert {
  id: string;
  name: string;
  states: string[];
  entity_types: string[];
  keywords: string[];
  categories: string[];
  amount_min: string | null;
  amount_max: string | null;
  include_federal: boolean;
  active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  subscriptionStatus: string;
  hasAccess: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
}

export interface BillingConfig {
  configured: boolean;
  priceMonthlyUsd: number;
  trialDays: number;
}

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Server-side fetch against the API (used by server components, sitemap and metadata). */
export async function apiGet<T>(path: string, revalidate = 300): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function apiGetOrNull<T>(path: string, revalidate = 300): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function toQuery(params: Record<string, string | number | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
