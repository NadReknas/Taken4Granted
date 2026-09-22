import type { Metadata } from "next";
import Link from "next/link";
import { apiGet, type Coverage, type StateCoverage } from "@/lib/api";

export const metadata: Metadata = {
  title: "Coverage — which states have grants indexed",
  description:
    "See which states Grant Retriever has state-level grant programs for, plus nationwide federal opportunities every state can apply to.",
};

export const revalidate = 300;

/** Tile-grid map: [code, column, row] in a 12x8 grid (standard US tile layout). */
const TILES: Array<[string, number, number]> = [
  ["AK", 1, 1], ["ME", 12, 1],
  ["WI", 6, 2], ["VT", 11, 2], ["NH", 12, 2],
  ["WA", 2, 3], ["ID", 3, 3], ["MT", 4, 3], ["ND", 5, 3], ["MN", 6, 3], ["IL", 7, 3], ["MI", 8, 3], ["NY", 10, 3], ["MA", 11, 3],
  ["OR", 2, 4], ["NV", 3, 4], ["WY", 4, 4], ["SD", 5, 4], ["IA", 6, 4], ["IN", 7, 4], ["OH", 8, 4], ["PA", 9, 4], ["NJ", 10, 4], ["CT", 11, 4], ["RI", 12, 4],
  ["CA", 2, 5], ["UT", 3, 5], ["CO", 4, 5], ["NE", 5, 5], ["MO", 6, 5], ["KY", 7, 5], ["WV", 8, 5], ["VA", 9, 5], ["MD", 10, 5], ["DE", 11, 5],
  ["AZ", 3, 6], ["NM", 4, 6], ["KS", 5, 6], ["AR", 6, 6], ["TN", 7, 6], ["NC", 8, 6], ["SC", 9, 6], ["DC", 10, 6],
  ["OK", 5, 7], ["LA", 6, 7], ["MS", 7, 7], ["AL", 8, 7], ["GA", 9, 7],
  ["HI", 1, 8], ["TX", 5, 8], ["FL", 9, 8], ["PR", 12, 8],
];

function tone(s: StateCoverage): string {
  const n = s.state + s.local;
  if (n === 0) return "bg-stone-100 text-stone-500 border-stone-200";
  if (n < 10) return "bg-amber-100 text-amber-900 border-amber-300";
  if (n < 50) return "bg-amber-300 text-amber-950 border-amber-400";
  return "bg-green-700 text-white border-green-800";
}

export default async function CoveragePage() {
  const data = await apiGet<Coverage>("/coverage", 3600);
  const byCode = new Map(data.states.map((s) => [s.code, s]));
  const covered = data.states.filter((s) => s.state + s.local > 0).sort((a, b) => b.state + b.local - (a.state + a.local));
  const missing = data.states.filter((s) => s.state + s.local === 0 && !["DC", "PR"].includes(s.code));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold">Where we fetch from</h1>
      <p className="mt-2 text-stone-700">
        Every state gets the {data.federalNationwide.toLocaleString()} nationwide federal grants on Grants.gov. State-run
        programs are indexed only where the state publishes a machine-readable feed; we&apos;re adding states one portal at a
        time and won&apos;t pretend to cover one we don&apos;t.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-stone-500">Nationwide federal</p>
          <p className="text-3xl font-bold">{data.federalNationwide.toLocaleString()}</p>
          <p className="text-sm text-stone-600">open grants any state can apply to</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-stone-500">States with state-level grants</p>
          <p className="text-3xl font-bold">
            {data.statesWithStateGrants} <span className="text-base font-normal text-stone-500">of {data.totalStates}</span>
          </p>
          <p className="text-sm text-stone-600">state portals indexed today</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-stone-500">County &amp; local</p>
          <p className="text-3xl font-bold">{data.states.reduce((n, s) => n + s.local, 0).toLocaleString()}</p>
          <p className="text-sm text-stone-600">local programs indexed (coming state by state)</p>
        </div>
      </div>

      <section className="card mt-8 overflow-x-auto">
        <div className="grid min-w-[560px] gap-1" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
          {TILES.map(([code, col, row]) => {
            const s = byCode.get(code);
            if (!s) return null;
            const n = s.state + s.local;
            return (
              <Link
                key={code}
                href={`/grants?states=${code}`}
                title={`${s.name}: ${s.state} state, ${s.local} local, ${s.federalTargeted} state-specific federal`}
                className={`flex aspect-square flex-col items-center justify-center rounded border text-xs font-semibold hover:ring-2 hover:ring-green-700 ${tone(s)}`}
                style={{ gridColumn: col, gridRow: row }}
              >
                <span>{code}</span>
                <span className="text-[10px] font-normal">{n > 0 ? n : "—"}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-stone-600">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 shrink-0 rounded border border-stone-200 bg-stone-100"></span> federal only</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 shrink-0 rounded border border-amber-300 bg-amber-100"></span> 1–9 state/local</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 shrink-0 rounded border border-amber-400 bg-amber-300"></span> 10–49</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 shrink-0 rounded border border-green-800 bg-green-700"></span> 50+</span>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">States with state-level programs</h2>
        {covered.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">None indexed yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2">State</th>
                <th className="py-2 text-right">State grants</th>
                <th className="py-2 text-right">Local</th>
                <th className="py-2 text-right">State-specific federal</th>
              </tr>
            </thead>
            <tbody>
              {covered.map((s) => (
                <tr key={s.code} className="border-t border-stone-200">
                  <td className="py-2">
                    <Link href={`/grants?states=${s.code}`} className="text-green-800 hover:underline">{s.name}</Link>
                  </td>
                  <td className="py-2 text-right">{s.state.toLocaleString()}</td>
                  <td className="py-2 text-right">{s.local.toLocaleString()}</td>
                  <td className="py-2 text-right">{s.federalTargeted.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Federal-only for now ({missing.length})</h2>
        <p className="mt-1 text-sm text-stone-600">
          Residents of these states still see every nationwide federal grant, plus any federal program targeted at their state.
          Until we index them, each state&apos;s own program listing is linked below.
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {missing.map((s) => (
            <li key={s.code} className="flex flex-wrap items-baseline gap-x-2">
              <Link href={`/grants?states=${s.code}`} className="font-medium hover:underline">{s.name}</Link>
              {s.portal && (
                <a href={s.portal.url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-800 hover:underline">
                  {s.portal.name} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-xs text-stone-500">
        Counts are open opportunities as of {new Date(data.updatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}.
        Want your state next? Email <a className="underline" href="mailto:alerts@grantretriever.com">alerts@grantretriever.com</a> with the portal URL.
      </p>
    </div>
  );
}
