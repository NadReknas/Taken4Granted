import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGetOrNull, type Opportunity } from "@/lib/api";
import { amountLabel, deadlineLabel, formatDate, money, titleCase } from "@/lib/format";

export const revalidate = 600;

const ENTITY_LABELS: Record<string, string> = {
  small_business: "Small businesses",
  for_profit: "For-profit organizations",
  nonprofit: "Nonprofits",
  individual: "Individuals",
  farm: "Farms & ranches",
  state_government: "State governments",
  local_government: "Local governments",
  tribal: "Tribal governments & organizations",
  education: "Schools & universities",
  any: "Open eligibility",
};

async function load(slug: string): Promise<Opportunity | null> {
  return apiGetOrNull<Opportunity>(`/opportunities/${encodeURIComponent(slug)}`, 600);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const o = await load(slug);
  if (!o) return { title: "Not found" };
  const dl = formatDate(o.deadline);
  return {
    title: o.title,
    description: `${o.agency ?? titleCase(o.level)} grant. ${dl ? `Deadline ${dl}. ` : ""}${amountLabel(o.amount_min, o.amount_max)}. ${(o.summary ?? "").slice(0, 140)}`,
    alternates: { canonical: `/grants/${o.slug}` },
    robots: o.status === "closed" ? { index: false, follow: true } : undefined,
  };
}

export default async function GrantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = await load(slug);
  if (!o) notFound();
  const dl = deadlineLabel(o.deadline, o.deadline_text);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: o.title,
    description: o.summary ?? undefined,
    provider: o.agency ? { "@type": "GovernmentOrganization", name: o.agency } : undefined,
    url: o.apply_url,
    areaServed: o.states.length ? o.states : "US",
    ...(o.deadline ? { availabilityEnds: o.deadline } : {}),
  };

  return (
    <article className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex flex-col gap-6">
        <nav className="text-sm text-stone-500" aria-label="Breadcrumb">
          <Link href="/grants" className="hover:underline">Directory</Link> / <span>{o.level === "federal" ? "Federal" : o.states.join(", ")}</span>
        </nav>
        <header>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="badge border-stone-300 bg-white">{o.level === "federal" ? "Federal" : `State · ${o.states.join(", ")}`}</span>
            <span className="badge border-stone-300 bg-white">{titleCase(o.status)}</span>
            {o.categories.map((c) => (
              <Link key={c} href={`/grants?categories=${c}`} className="badge border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
                {titleCase(c)}
              </Link>
            ))}
          </div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{o.title}</h1>
          {o.agency && <p className="mt-1 text-stone-600">{o.agency}</p>}
        </header>

        {o.summary && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Summary</h2>
            <div className="whitespace-pre-line text-stone-800">{o.summary}</div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-lg font-semibold">Eligibility</h2>
          {o.entity_types.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {o.entity_types.map((e) => (
                <li key={e} className="badge border-stone-300 bg-white">{ENTITY_LABELS[e] ?? titleCase(e)}</li>
              ))}
            </ul>
          )}
          {o.eligibility_text ? (
            <div className="whitespace-pre-line text-sm text-stone-700">{o.eligibility_text}</div>
          ) : (
            <p className="text-sm text-stone-600">See the official notice for full eligibility requirements.</p>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className="card flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Application deadline</p>
            <p className={`text-lg font-semibold ${dl.tone === "urgent" ? "text-red-700" : dl.tone === "soon" ? "text-amber-700" : ""}`}>{dl.text}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Award</p>
            <p className="font-medium">{amountLabel(o.amount_min, o.amount_max)}</p>
            {o.total_funding && <p className="text-sm text-stone-600">Program total {money(o.total_funding)}</p>}
          </div>
          {o.posted_at && (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-500">Posted</p>
              <p className="text-sm">{formatDate(o.posted_at)}</p>
            </div>
          )}
          <a href={o.apply_url} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary w-full">
            Apply on official site ↗
          </a>
          <p className="text-xs text-stone-500">
            Source: {o.source_id.replaceAll("_", " ")} · ID {o.external_id} · last verified {formatDate(o.last_seen_at)}
          </p>
        </div>
        <div className="card bg-emerald-50 text-sm">
          <p className="font-semibold">Want the next one like this in your inbox?</p>
          <p className="mt-1 text-stone-700">Set alerts by state, applicant type and award range.</p>
          <Link href="/pricing" className="btn-primary mt-3 w-full">Start 7-day trial</Link>
        </div>
      </aside>
    </article>
  );
}
