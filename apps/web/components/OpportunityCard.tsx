import Link from "next/link";
import type { Opportunity } from "@/lib/api";
import { amountLabel, deadlineLabel, titleCase } from "@/lib/format";

const TONE: Record<string, string> = {
  urgent: "border-red-200 bg-red-50 text-red-800",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  normal: "border-stone-200 bg-stone-50 text-stone-700",
  none: "border-stone-200 bg-stone-50 text-stone-500",
};

export function OpportunityCard({ o }: { o: Opportunity }) {
  const dl = deadlineLabel(o.deadline, o.deadline_text);
  return (
    <article className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${o.level === "federal" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {o.level === "federal" ? "Federal" : o.states.length ? o.states.join(", ") : titleCase(o.level)}
        </span>
        {o.status === "forecasted" && <span className="badge border-violet-200 bg-violet-50 text-violet-800">Forecasted</span>}
        <span className={`badge ${TONE[dl.tone]}`}>{dl.text}</span>
      </div>
      <h3 className="text-base font-semibold leading-snug">
        <Link href={`/grants/${o.slug}`} className="hover:underline">
          {o.title}
        </Link>
      </h3>
      {o.agency && <p className="text-sm text-stone-600">{o.agency}</p>}
      {o.summary && <p className="line-clamp-3 text-sm text-stone-700">{o.summary}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-stone-800">{amountLabel(o.amount_min, o.amount_max)}</span>
        <a href={o.apply_url} target="_blank" rel="noopener noreferrer nofollow" className="text-emerald-700 hover:underline">
          Official notice ↗
        </a>
      </div>
    </article>
  );
}
