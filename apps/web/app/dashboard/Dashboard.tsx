"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Alert, BillingConfig, DigestSummary, MatchedOpportunity, Meta, Opportunity, SavedOpportunity, SearchResult, User } from "@/lib/api";
import { toQuery } from "@/lib/api";
import { api, ApiError } from "@/lib/client";
import { amountLabel, deadlineLabel, formatDate, titleCase } from "@/lib/format";
import { AlertForm, type AlertDraft } from "@/components/AlertForm";
import { OpportunityCard } from "@/components/OpportunityCard";
import { useSaved } from "@/components/SavedProvider";
import { searchToDraft } from "@/components/SaveSearchButton";
import { SubscribeButton } from "@/components/SubscribeButton";

const TABS = [
  ["matches", "Matches"],
  ["search", "Search"],
  ["saved", "Saved"],
  ["alerts", "Alerts"],
  ["digests", "Digests"],
  ["account", "Account"],
] as const;
type Tab = (typeof TABS)[number][0];

export function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = TABS.some(([t]) => t === tabParam) ? (tabParam as Tab) : "matches";
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { ids: savedIds } = useSaved();

  const load = useCallback(async () => {
    try {
      const me = await api<{ user: User | null }>("/me");
      if (!me.user) {
        router.replace("/login?redirect=/dashboard");
        return;
      }
      setUser(me.user);
      const [a, m, b] = await Promise.all([api<{ items: Alert[] }>("/alerts"), api<Meta>("/meta"), api<BillingConfig>("/billing/config")]);
      setAlerts(a.items);
      setMeta(m);
      setBilling(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function go(t: Tab) {
    router.push(`/dashboard${t === "matches" ? "" : `?tab=${t}`}`);
  }

  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    window.location.assign("/login");
  }

  if (loading) return <p className="text-stone-600">Loading…</p>;
  if (!user) return null;

  const activeAlerts = alerts.filter((a) => a.active).length;
  const counts: Partial<Record<Tab, number>> = { alerts: alerts.length, saved: savedIds?.size };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{greeting(user)}</h1>
          <p className="text-sm text-stone-600">
            {activeAlerts ? `${activeAlerts} active alert${activeAlerts === 1 ? "" : "s"} · ` : ""}
            {user.hasAccess ? "Daily digests enabled" : "Digests paused — start a trial to enable"}
          </p>
        </div>
        <div className="flex gap-2">
          {user.role === "admin" && <Link href="/admin" className="btn-secondary">Admin</Link>}
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-stone-200" aria-label="Dashboard sections">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => go(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-green-700 text-green-800" : "border-transparent text-stone-600 hover:text-stone-900"}`}
          >
            {label}
            {counts[t] ? <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{counts[t]}</span> : null}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {tab === "matches" && <MatchesTab user={user} alerts={alerts} billing={billing} onGo={go} />}
      {tab === "search" && meta && <SearchTab meta={meta} user={user} onSaved={load} />}
      {tab === "saved" && <SavedTab />}
      {tab === "alerts" && meta && <AlertsTab user={user} alerts={alerts} meta={meta} reload={load} setError={setError} />}
      {tab === "digests" && <DigestsTab user={user} />}
      {tab === "account" && <SubscriptionCard user={user} billing={billing} setError={setError} />}
    </div>
  );
}

function greeting(user: User): string {
  const first = user.name?.split(" ")[0];
  return first ? `Welcome back, ${first}` : "Your retriever";
}

/* ---------------- Matches ---------------- */

function MatchesTab({ user, alerts, billing, onGo }: { user: User; alerts: Alert[]; billing: BillingConfig | null; onGo: (t: Tab) => void }) {
  const [data, setData] = useState<{ items: MatchedOpportunity[]; activeAlerts: number } | null | "error">(null);
  const [days, setDays] = useState(30);
  const active = alerts.filter((a) => a.active);

  useEffect(() => {
    if (!user.hasAccess || active.length === 0) return;
    let cancelled = false;
    setData(null);
    api<{ items: MatchedOpportunity[]; activeAlerts: number }>(`/alerts/matches?days=${days}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData("error");
      });
    return () => {
      cancelled = true;
    };
  }, [user.hasAccess, active.length, days]);

  if (!user.hasAccess)
    return (
      <EmptyState title="Start a free trial to get matches" body="Alerts and daily digests need an active trial or subscription. Searching and saving grants is free.">
        {billing && <SubscribeButton configured={billing.configured} label="Start 7-day free trial" />}
        <button onClick={() => onGo("search")} className="btn-secondary">Search grants</button>
      </EmptyState>
    );
  if (active.length === 0)
    return (
      <EmptyState title="No alerts yet" body="Create an alert (or save a search) and new matching grants will show up here and in your daily digest.">
        <button onClick={() => onGo("alerts")} className="btn-primary">Create an alert</button>
        <button onClick={() => onGo("search")} className="btn-secondary">Search grants</button>
      </EmptyState>
    );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
        <span>New grants matching your {active.length} active alert{active.length === 1 ? "" : "s"}, soonest deadline first.</span>
        <label className="flex items-center gap-2">
          Added in the last
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input !w-auto !py-1">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>year</option>
          </select>
        </label>
      </div>
      {data === null && <p className="text-stone-600">Fetching matches…</p>}
      {data === "error" && <p className="text-red-700">Could not load matches.</p>}
      {data && data !== "error" && data.items.length === 0 && (
        <EmptyState title="Nothing new in this window" body="Try a longer window, or broaden an alert's states, categories or keywords.">
          <button onClick={() => onGo("alerts")} className="btn-secondary">Edit alerts</button>
        </EmptyState>
      )}
      {data && data !== "error" && data.items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((o) => (
            <div key={o.id} className="flex flex-col gap-1">
              <OpportunityCard o={o} />
              <p className="px-1 text-xs text-stone-500">Matched: {o.matched_alerts.map((a) => a.name).join(", ")}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Search ---------------- */

type SearchValues = Record<string, string | undefined>;

function SearchTab({ meta, user, onSaved }: { meta: Meta; user: User; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<SearchValues>({ sort: "deadline" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "busy" | "done" | "paywall" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api<SearchResult>(`/opportunities${toQuery({ ...v, page, pageSize: 24 })}`)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [v, page]);

  function set(k: string, val: string) {
    setPage(1);
    setSaveState("idle");
    setV((prev) => ({ ...prev, [k]: val || undefined }));
  }

  const hasFilters = ["q", "states", "entityTypes", "categories", "minAmount", "deadlineWithinDays"].some((k) => v[k]);
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  async function saveAsAlert() {
    setSaveState("busy");
    try {
      await api("/alerts", { method: "POST", body: JSON.stringify(searchToDraft(v, meta.states)) });
      await onSaved();
      setSaveState("done");
    } catch (err) {
      setSaveState(err instanceof ApiError && err.code === "SUBSCRIPTION_REQUIRED" ? "paywall" : "error");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <form onSubmit={(e) => e.preventDefault()} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm lg:col-span-2">
          <span className="mb-1 block text-stone-600">Keywords</span>
          <input value={v.q ?? ""} onChange={(e) => set("q", e.target.value)} placeholder="solar, rural broadband, soil health…" className="input" />
        </label>
        <Select label="State" value={v.states} onChange={(x) => set("states", x)} options={[["", "Any state"], ...Object.entries(meta.states)]} />
        <Select label="Applicant" value={v.entityTypes} onChange={(x) => set("entityTypes", x)} options={[["", "Any applicant"], ...meta.entityTypes.filter((e) => e.value !== "any").map((e) => [e.value, e.label] as [string, string])]} />
        <Select label="Category" value={v.categories} onChange={(x) => set("categories", x)} options={[["", "Any category"], ...meta.categories.map((c) => [c, titleCase(c)] as [string, string])]} />
        <Select label="Level" value={v.levels} onChange={(x) => set("levels", x)} options={[["", "Federal + state"], ["federal", "Federal only"], ["state", "State only"]]} />
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Min award ($)</span>
          <input type="number" min={0} value={v.minAmount ?? ""} onChange={(e) => set("minAmount", e.target.value)} className="input" />
        </label>
        <Select label="Deadline within" value={v.deadlineWithinDays} onChange={(x) => set("deadlineWithinDays", x)} options={[["", "Any time"], ["14", "14 days"], ["30", "30 days"], ["60", "60 days"], ["90", "90 days"]]} />
        <Select label="Sort" value={v.sort} onChange={(x) => set("sort", x)} options={[["deadline", "Deadline (soonest)"], ["newest", "Newest"], ["amount", "Largest award"], ["relevance", "Relevance"]]} />
        <div className="flex flex-wrap items-end gap-2 lg:col-span-3">
          {hasFilters && saveState !== "done" && saveState !== "paywall" && (
            <button type="button" onClick={() => void saveAsAlert()} disabled={saveState === "busy"} className="btn-primary">
              {saveState === "busy" ? "Saving…" : "Save this search as an alert"}
            </button>
          )}
          {saveState === "done" && <span className="text-sm text-green-800">Alert saved — new matches will arrive in your digest.</span>}
          {saveState === "paywall" && !user.hasAccess && (
            <span className="text-sm text-stone-600">
              Alerts need a trial — <Link href="/pricing" className="underline">start a 7-day trial</Link>.
            </span>
          )}
          {saveState === "error" && <span className="text-sm text-red-700">Could not save alert.</span>}
          {hasFilters && (
            <button type="button" onClick={() => { setV({ sort: "deadline" }); setPage(1); setSaveState("idle"); }} className="btn-secondary">
              Reset
            </button>
          )}
        </div>
      </form>
      <p className="text-sm text-stone-600">
        {busy ? "Searching…" : result ? `${result.total.toLocaleString("en-US")} result${result.total === 1 ? "" : "s"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}` : "Search failed."}
      </p>
      {result && result.items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.items.map((o: Opportunity) => <OpportunityCard key={o.id} o={o} />)}
        </div>
      )}
      {result && result.items.length === 0 && !busy && <EmptyState title="No grants match" body="Try widening the state or category." />}
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary disabled:opacity-50">← Previous</button>
          <span className="text-stone-600">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-secondary disabled:opacity-50">Next →</button>
        </nav>
      )}
    </section>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string | undefined; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-stone-600">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="input">
        {options.map(([val, text]) => (
          <option key={val} value={val}>{text}</option>
        ))}
      </select>
    </label>
  );
}

/* ---------------- Saved ---------------- */

function SavedTab() {
  const { ids } = useSaved();
  const [items, setItems] = useState<SavedOpportunity[] | null>(null);
  const size = ids?.size ?? 0;

  useEffect(() => {
    let cancelled = false;
    api<{ items: SavedOpportunity[] }>("/saved")
      .then((d) => {
        if (!cancelled) setItems(d.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [size]);

  if (items === null) return <p className="text-stone-600">Loading saved grants…</p>;
  const visible = items.filter((o) => !ids || ids.has(o.id));
  if (visible.length === 0)
    return (
      <EmptyState title="No saved grants" body="Click the ☆ on any grant to keep it here, sorted by deadline.">
        <Link href="/dashboard?tab=search" className="btn-primary">Search grants</Link>
      </EmptyState>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((o) => <OpportunityCard key={o.id} o={o} />)}
    </div>
  );
}

/* ---------------- Alerts ---------------- */

function AlertsTab({ user, alerts, meta, reload, setError }: { user: User; alerts: Alert[]; meta: Meta; reload: () => Promise<void>; setError: (e: string | null) => void }) {
  const [editing, setEditing] = useState<Alert | "new" | null>(alerts.length === 0 && user.hasAccess ? "new" : null);
  const [preview, setPreview] = useState<{ id: string; items: Opportunity[] } | null>(null);

  async function save(draft: AlertDraft) {
    setError(null);
    try {
      if (editing === "new") await api<Alert>("/alerts", { method: "POST", body: JSON.stringify(draft) });
      else if (editing) await api<Alert>(`/alerts/${editing.id}`, { method: "PUT", body: JSON.stringify(draft) });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "SUBSCRIPTION_REQUIRED" ? "Start your trial to save alerts." : err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this alert?")) return;
    await api(`/alerts/${id}`, { method: "DELETE" });
    setPreview(null);
    await reload();
  }

  async function toggle(a: Alert) {
    await api(`/alerts/${a.id}`, { method: "PUT", body: JSON.stringify(toDraft({ ...a, active: !a.active })) });
    await reload();
  }

  async function showPreview(id: string) {
    setError(null);
    try {
      const r = await api<{ items: Opportunity[] }>(`/alerts/${id}/preview`);
      setPreview({ id, items: r.items });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-600">Each alert is a saved set of criteria; new matches are emailed in one daily digest.</p>
        {user.hasAccess && editing === null && (
          <button onClick={() => setEditing("new")} className="btn-primary">New alert</button>
        )}
      </div>

      {!user.hasAccess && (
        <p className="text-sm text-stone-600">
          Alerts require an active trial or subscription — see <Link href="/dashboard?tab=account" className="underline">Account</Link>. Searching and saving grants is free.
        </p>
      )}

      {editing !== null && (
        <AlertForm meta={meta} initial={editing === "new" ? undefined : toDraft(editing)} onCancel={() => setEditing(null)} onSubmit={save} />
      )}

      <ul className="grid gap-3">
        {alerts.map((a) => (
          <li key={a.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {a.name}
                  {!a.active && <span className="badge ml-2 border-stone-200 bg-stone-100 text-stone-600">Paused</span>}
                </p>
                <p className="text-sm text-stone-600">{describe(a, meta)}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={() => showPreview(a.id)} className="btn-secondary">Preview</button>
                <button onClick={() => setEditing(a)} className="btn-secondary">Edit</button>
                <button onClick={() => toggle(a)} className="btn-secondary">{a.active ? "Pause" : "Resume"}</button>
                <button onClick={() => remove(a.id)} className="btn-secondary text-red-700">Delete</button>
              </div>
            </div>
            {preview?.id === a.id && (
              <div className="mt-4 border-t border-stone-100 pt-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Matches from the last 30 days ({preview.items.length})</p>
                {preview.items.length === 0 ? (
                  <p className="text-sm text-stone-600">Nothing matched yet — try broadening the criteria.</p>
                ) : (
                  <ul className="divide-y divide-stone-100 text-sm">
                    {preview.items.map((o) => (
                      <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <Link href={`/grants/${o.slug}`} className="font-medium hover:underline">{o.title}</Link>
                        <span className="text-stone-600">{amountLabel(o.amount_min, o.amount_max)} · {deadlineLabel(o.deadline, o.deadline_text).text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function toDraft(a: Alert): AlertDraft {
  return {
    name: a.name,
    states: a.states,
    entityTypes: a.entity_types,
    keywords: a.keywords,
    categories: a.categories,
    amountMin: a.amount_min == null ? null : Number(a.amount_min),
    amountMax: a.amount_max == null ? null : Number(a.amount_max),
    includeFederal: a.include_federal,
    active: a.active,
  };
}

function describe(a: Alert, meta: Meta | null): string {
  const parts: string[] = [];
  parts.push(a.states.length ? a.states.map((s) => meta?.states[s] ?? s).join(", ") : "All states");
  if (a.include_federal) parts.push("+ federal");
  if (a.entity_types.length) parts.push(a.entity_types.map((e) => meta?.entityTypes.find((x) => x.value === e)?.label ?? titleCase(e)).join("/"));
  if (a.categories.length) parts.push(a.categories.map(titleCase).join(", "));
  if (a.keywords.length) parts.push(`“${a.keywords.join("”, “")}”`);
  if (a.amount_min || a.amount_max) parts.push(amountLabel(a.amount_min, a.amount_max));
  return parts.join(" · ");
}

/* ---------------- Digests ---------------- */

function DigestsTab({ user }: { user: User }) {
  const [items, setItems] = useState<DigestSummary[] | null>(null);
  useEffect(() => {
    api<{ items: DigestSummary[] }>("/digests").then((d) => setItems(d.items)).catch(() => setItems([]));
  }, []);
  if (items === null) return <p className="text-stone-600">Loading digests…</p>;
  if (items.length === 0)
    return (
      <EmptyState
        title="No digests sent yet"
        body={user.hasAccess ? `Digests go to ${user.email} each morning when your alerts have new matches.` : "Digests start once you have an active trial and at least one alert."}
      />
    );
  return (
    <ul className="grid gap-3">
      {items.map((d) => (
        <li key={d.id} className="card">
          <p className="font-semibold">
            {formatDate(d.sent_at, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            <span className="ml-2 text-sm font-normal text-stone-600">{d.count} grant{d.count === 1 ? "" : "s"}</span>
          </p>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {d.items.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/grants/${o.slug}`} className="font-medium hover:underline">{o.title}</Link>
                <span className="text-stone-600">{amountLabel(o.amount_min, o.amount_max)} · {deadlineLabel(o.deadline, o.deadline_text).text}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Account ---------------- */

function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-stone-600">{body}</p>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function SubscriptionCard({ user, billing, setError }: { user: User; billing: BillingConfig | null; setError: (e: string | null) => void }) {
  const status = user.subscriptionStatus;
  const label: Record<string, string> = {
    none: "No subscription",
    trialing: "Free trial",
    active: "Active",
    past_due: "Payment past due",
    canceled: "Canceled",
    unpaid: "Unpaid",
    incomplete: "Checkout incomplete",
    incomplete_expired: "Checkout expired",
    paused: "Paused",
  };
  const free = user.role === "admin" || user.comped;

  async function portal() {
    try {
      const { url } = await api<{ url: string }>("/billing/portal", { method: "POST", body: "{}" });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card">
        <p className="text-xs uppercase tracking-wide text-stone-500">Signed in as</p>
        <p className="text-lg font-semibold">{user.name ?? user.email}</p>
        {user.name && <p className="text-sm text-stone-600">{user.email}</p>}
        <p className="mt-2 text-sm text-stone-600">Digests are sent to this address.</p>
      </section>
      {free && !user.hasBillingAccount ? (
        <section className="card">
          <p className="text-xs uppercase tracking-wide text-stone-500">Subscription</p>
          <p className="text-lg font-semibold">{user.role === "admin" ? "Admin — full access" : "Complimentary access"}</p>
          <p className="text-sm text-stone-600">Alerts and digests are enabled on this account without a subscription.</p>
        </section>
      ) : (
        <section className="card flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500">Subscription</p>
            <p className="text-lg font-semibold">{label[status] ?? titleCase(status)}</p>
            <p className="text-sm text-stone-600">
              {status === "trialing" && user.trialEndsAt && `Trial ends ${formatDate(user.trialEndsAt)}${user.cancelAtPeriodEnd ? " (will not renew)" : ` — then $${billing?.priceMonthlyUsd ?? 19}/month`}`}
              {status === "active" && user.currentPeriodEnd && `${user.cancelAtPeriodEnd ? "Ends" : "Renews"} ${formatDate(user.currentPeriodEnd)}`}
              {status === "past_due" && "Update your card in the billing portal to keep alerts running."}
              {status === "none" && "Start a 7-day trial to save alerts and receive digests."}
              {(status === "canceled" || status === "unpaid" || status === "incomplete_expired") && "Restart your subscription to resume alerts."}
            </p>
          </div>
          <div className="flex gap-2">
            {user.hasBillingAccount && billing?.configured && <button onClick={portal} className="btn-secondary">Manage billing</button>}
            {!user.hasAccess && billing && <SubscribeButton configured={billing.configured} label={status === "none" ? "Start 7-day free trial" : "Subscribe"} />}
          </div>
        </section>
      )}
    </div>
  );
}
