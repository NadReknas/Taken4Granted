import Link from "next/link";
import type { Meta } from "@/lib/api";
import { titleCase } from "@/lib/format";

interface Props {
  meta: Meta;
  values: Record<string, string | undefined>;
}

/** Plain HTML form so the directory works without JavaScript and every filter set is a crawlable URL. */
export function SearchFilters({ meta, values }: Props) {
  return (
    <form method="get" action="/grants" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="lg:col-span-2 text-sm">
        <span className="mb-1 block text-stone-600">Keywords</span>
        <input name="q" defaultValue={values.q ?? ""} placeholder="solar, rural broadband, soil health…" className="input" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">State</span>
        <select name="states" defaultValue={values.states ?? ""} className="input">
          <option value="">Any state</option>
          {Object.entries(meta.states).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Applicant</span>
        <select name="entityTypes" defaultValue={values.entityTypes ?? ""} className="input">
          <option value="">Any applicant</option>
          {meta.entityTypes.filter((e) => e.value !== "any").map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Category</span>
        <select name="categories" defaultValue={values.categories ?? ""} className="input">
          <option value="">Any category</option>
          {meta.categories.map((c) => (
            <option key={c} value={c}>{titleCase(c)}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Level</span>
        <select name="levels" defaultValue={values.levels ?? ""} className="input">
          <option value="">Federal + state</option>
          <option value="federal">Federal only</option>
          <option value="state">State only</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Min award ($)</span>
        <input name="minAmount" type="number" min={0} defaultValue={values.minAmount ?? ""} className="input" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Deadline within</span>
        <select name="deadlineWithinDays" defaultValue={values.deadlineWithinDays ?? ""} className="input">
          <option value="">Any time</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Status</span>
        <select name="status" defaultValue={values.status ?? "open"} className="input">
          <option value="open">Open</option>
          <option value="forecasted">Forecasted</option>
          <option value="all">All (incl. closed)</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Sort</span>
        <select name="sort" defaultValue={values.sort ?? "deadline"} className="input">
          <option value="deadline">Deadline (soonest)</option>
          <option value="newest">Newest</option>
          <option value="amount">Largest award</option>
          <option value="relevance">Relevance</option>
        </select>
      </label>
      <div className="flex items-end gap-2 lg:col-span-2">
        <button type="submit" className="btn-primary flex-1">Search</button>
        <Link href="/grants" className="btn-secondary">Reset</Link>
      </div>
    </form>
  );
}
