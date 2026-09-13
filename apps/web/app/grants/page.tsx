import type { Metadata } from "next";
import Link from "next/link";
import { apiGet, toQuery, type Meta, type SearchResult } from "@/lib/api";
import { OpportunityCard } from "@/components/OpportunityCard";
import { SearchFilters } from "@/components/SearchFilters";
import { titleCase } from "@/lib/format";

export const revalidate = 300;

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function pick(sp: Params): Record<string, string | undefined> {
  const keys = ["q", "states", "entityTypes", "categories", "levels", "status", "minAmount", "maxAmount", "deadlineWithinDays", "sort", "page"];
  return Object.fromEntries(keys.map((k) => [k, first(sp[k])]));
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const v = pick(await searchParams);
  const meta = await apiGet<Meta>("/meta", 86400);
  const parts = [
    v.categories ? titleCase(v.categories) : null,
    v.q ? `"${v.q}"` : null,
    v.states ? meta.states[v.states] : null,
    v.levels ? titleCase(v.levels) : null,
  ].filter(Boolean);
  const title = parts.length ? `${parts.join(" · ")} grants` : "Open grant directory";
  const hasFilters = Object.values(v).some((x) => x && x !== "open" && x !== "deadline");
  return {
    title,
    description: `Searchable directory of ${parts.length ? parts.join(", ") + " " : ""}sustainability and rural business grants with deadlines and official application links.`,
    alternates: { canonical: hasFilters ? `/grants${toQuery(v)}` : "/grants" },
    robots: v.page && v.page !== "1" ? { index: false, follow: true } : undefined,
  };
}

export default async function GrantsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const v = pick(await searchParams);
  const [meta, result] = await Promise.all([
    apiGet<Meta>("/meta", 86400),
    apiGet<SearchResult>(`/opportunities${toQuery({ ...v, pageSize: 24 })}`),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageLink = (p: number) => `/grants${toQuery({ ...v, page: p > 1 ? String(p) : undefined })}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Grant directory</h1>
        <p className="text-sm text-stone-600">Updated daily. Deadlines shown in UTC; confirm on the official notice.</p>
      </div>
      <SearchFilters meta={meta} values={v} />
      <p className="text-sm text-stone-600">
        {result.total.toLocaleString("en-US")} result{result.total === 1 ? "" : "s"}
        {result.total > 0 && ` · page ${result.page} of ${pages}`}
      </p>
      {result.items.length === 0 ? (
        <div className="card text-center text-stone-600">
          No opportunities match these filters. Try widening the state or category, or <Link href="/grants" className="underline">reset filters</Link>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.items.map((o) => <OpportunityCard key={o.id} o={o} />)}
        </div>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          {result.page > 1 && <Link href={pageLink(result.page - 1)} className="btn-secondary">← Previous</Link>}
          <span className="text-stone-600">Page {result.page} of {pages}</span>
          {result.page < pages && <Link href={pageLink(result.page + 1)} className="btn-secondary">Next →</Link>}
        </nav>
      )}
    </div>
  );
}
