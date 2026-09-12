import Link from "next/link";
import { apiGet, type SearchResult, type Stats } from "@/lib/api";
import { OpportunityCard } from "@/components/OpportunityCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stats, closing, newest] = await Promise.all([
    apiGet<Stats>("/stats"),
    apiGet<SearchResult>("/opportunities?sort=deadline&deadlineWithinDays=45&pageSize=6"),
    apiGet<SearchResult>("/opportunities?sort=newest&pageSize=6"),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Every open sustainability &amp; rural business grant, in one radar.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-stone-700">
            We pull open notices from Grants.gov and state grant portals every day, normalise deadlines, eligibility and
            award sizes, and link you straight to the official application.
          </p>
          <form action="/grants" method="get" className="mt-6 flex max-w-xl gap-2">
            <input name="q" className="input" placeholder="Search e.g. solar, water efficiency, rural broadband" aria-label="Search grants" />
            <button className="btn-primary" type="submit">Search</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {[
              ["Energy", "/grants?categories=energy"],
              ["Agriculture", "/grants?categories=agriculture"],
              ["Rural development", "/grants?categories=rural_development"],
              ["Water", "/grants?categories=water"],
              ["Small business", "/grants?entityTypes=small_business"],
            ].map(([label, href]) => (
              <Link key={href} href={href!} className="badge border-stone-300 bg-white text-stone-700 hover:bg-stone-100">
                {label}
              </Link>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          <Stat label="Open opportunities" value={stats.open} />
          <Stat label="Closing in 30 days" value={stats.closingSoon} />
          <Stat label="Added this week" value={stats.addedThisWeek} />
        </dl>
      </section>

      <Section title="Closing soon" href="/grants?deadlineWithinDays=45&sort=deadline" items={closing} />
      <Section title="Newly listed" href="/grants?sort=newest" items={newest} />

      <section className="card flex flex-col items-start gap-3 bg-emerald-50 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Stop checking portals. Get a digest instead.</h2>
          <p className="text-sm text-stone-700">
            Save your state, applicant type and award range. New matches land in your inbox — $29/month after a 7-day trial.
          </p>
        </div>
        <Link href="/pricing" className="btn-primary">Start free trial</Link>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card py-4">
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="text-2xl font-semibold">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

function Section({ title, href, items }: { title: string; href: string; items: { items: import("@/lib/api").Opportunity[] } }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link href={href} className="text-sm text-emerald-700 hover:underline">View all →</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.items.map((o) => <OpportunityCard key={o.id} o={o} />)}
      </div>
    </section>
  );
}
