"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Alert, BillingConfig, Meta, Opportunity, User } from "@/lib/api";
import { api, ApiError } from "@/lib/client";
import { amountLabel, deadlineLabel, formatDate, titleCase } from "@/lib/format";
import { AlertForm, type AlertDraft } from "@/components/AlertForm";
import { SubscribeButton } from "@/components/SubscribeButton";

export function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  const [editing, setEditing] = useState<Alert | "new" | null>(null);
  const [preview, setPreview] = useState<{ id: string; items: Opportunity[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function save(draft: AlertDraft) {
    setError(null);
    try {
      if (editing === "new") await api<Alert>("/alerts", { method: "POST", body: JSON.stringify(draft) });
      else if (editing) await api<Alert>(`/alerts/${editing.id}`, { method: "PUT", body: JSON.stringify(draft) });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "SUBSCRIPTION_REQUIRED" ? "Start your trial to save alerts." : err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this alert?")) return;
    await api(`/alerts/${id}`, { method: "DELETE" });
    setPreview(null);
    await load();
  }

  async function toggle(a: Alert) {
    await api(`/alerts/${a.id}`, { method: "PUT", body: JSON.stringify(toDraft({ ...a, active: !a.active })) });
    await load();
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

  async function portal() {
    try {
      const { url } = await api<{ url: string }>("/billing/portal", { method: "POST", body: "{}" });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    router.push("/");
    router.refresh();
  }

  if (loading) return <p className="text-stone-600">Loading…</p>;
  if (!user) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your radar</h1>
          <p className="text-sm text-stone-600">{user.email}</p>
        </div>
        <button onClick={logout} className="btn-secondary">Sign out</button>
      </div>

      <SubscriptionCard user={user} billing={billing} onPortal={portal} />

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alerts</h2>
          {user.hasAccess && editing === null && (
            <button onClick={() => setEditing("new")} className="btn-primary">New alert</button>
          )}
        </div>

        {!user.hasAccess && (
          <p className="text-sm text-stone-600">
            Alerts require an active trial or subscription. The <Link href="/grants" className="underline">directory</Link> is always free.
          </p>
        )}

        {editing !== null && meta && (
          <AlertForm
            meta={meta}
            initial={editing === "new" ? undefined : toDraft(editing)}
            onCancel={() => setEditing(null)}
            onSubmit={save}
          />
        )}

        {alerts.length === 0 && editing === null && user.hasAccess && (
          <div className="card text-sm text-stone-600">No alerts yet. Create one to start receiving digests.</div>
        )}

        <ul className="grid gap-3">
          {alerts.map((a) => (
            <li key={a.id} className={`card flex flex-col gap-2 ${a.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.name}</h3>
                  <p className="text-sm text-stone-600">{describe(a, meta)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <button onClick={() => showPreview(a.id)} className="btn-secondary !py-1">Preview</button>
                  <button onClick={() => setEditing(a)} className="btn-secondary !py-1">Edit</button>
                  <button onClick={() => toggle(a)} className="btn-secondary !py-1">{a.active ? "Pause" : "Resume"}</button>
                  <button onClick={() => remove(a.id)} className="btn-secondary !py-1 text-red-700">Delete</button>
                </div>
              </div>
              {preview?.id === a.id && (
                <div className="mt-2 border-t border-stone-200 pt-3">
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
    </div>
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

function SubscriptionCard({ user, billing, onPortal }: { user: User; billing: BillingConfig | null; onPortal: () => void }) {
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
  return (
    <section className="card flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-stone-500">Subscription</p>
        <p className="text-lg font-semibold">{label[status] ?? titleCase(status)}</p>
        <p className="text-sm text-stone-600">
          {status === "trialing" && user.trialEndsAt && `Trial ends ${formatDate(user.trialEndsAt)}${user.cancelAtPeriodEnd ? " (will not renew)" : " — then $29/month"}`}
          {status === "active" && user.currentPeriodEnd && `${user.cancelAtPeriodEnd ? "Ends" : "Renews"} ${formatDate(user.currentPeriodEnd)}`}
          {status === "past_due" && "Update your card in the billing portal to keep alerts running."}
          {status === "none" && "Start a 7-day trial to save alerts and receive digests."}
          {(status === "canceled" || status === "unpaid" || status === "incomplete_expired") && "Restart your subscription to resume alerts."}
        </p>
      </div>
      <div className="flex gap-2">
        {user.hasBillingAccount && billing?.configured && (
          <button onClick={onPortal} className="btn-secondary">Manage billing</button>
        )}
        {!user.hasAccess && billing && <SubscribeButton configured={billing.configured} label={status === "none" ? "Start 7-day free trial" : "Subscribe"} />}
      </div>
    </section>
  );
}
