"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AdminOverview, AdminUser, User } from "@/lib/api";
import { api, ApiError } from "@/lib/client";
import { formatDate, titleCase } from "@/lib/format";

export function Admin() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async (q: string) => {
    const r = await api<{ items: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setUsers(r.items);
  }, []);

  const load = useCallback(async () => {
    try {
      const { user } = await api<{ user: User | null }>("/me");
      if (!user) return router.replace("/login?redirect=/admin");
      if (user.role !== "admin") return router.replace("/dashboard");
      setMe(user);
      const [o] = await Promise.all([api<AdminOverview>("/admin/overview"), loadUsers("")]);
      setOverview(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [router, loadUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run<T>(fn: () => Promise<T>) {
    setError(null);
    try {
      await fn();
      await Promise.all([loadUsers(search), api<AdminOverview>("/admin/overview").then(setOverview)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    }
  }

  const patch = (u: AdminUser, body: Partial<Pick<AdminUser, "comped" | "role">>) =>
    run(() => api(`/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) }));

  if (loading) return <p className="text-stone-600">Loading…</p>;
  if (!me) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-stone-600">Signed in as {me.email}</p>
        </div>
        <Link href="/dashboard" className="btn-secondary">Back to dashboard</Link>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {overview && (
        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Users" value={overview.counts.users} />
          <Stat label="With access" value={overview.counts.with_access} />
          <Stat label="Paying / trial" value={overview.counts.paying} />
          <Stat label="Comped" value={overview.counts.comped} />
          <Stat label="Active alerts" value={overview.counts.alerts} />
          <Stat label="Open grants" value={overview.counts.opportunities} />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Users</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => loadUsers(search));
            }}
          >
            <input
              className="input !py-1.5"
              placeholder="Search email or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn-secondary !py-1.5">Search</button>
          </form>
        </div>

        <form
          className="card flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/admin/users", { method: "POST", body: JSON.stringify({ email: newEmail, comped: true }) });
              setNewEmail("");
            });
          }}
        >
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-stone-600">Add a free (comped) account</span>
            <input
              type="email"
              required
              className="input"
              placeholder="tester@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary">Grant free access</button>
          <p className="basis-full text-xs text-stone-500">
            The person then signs in with Google or an email link at that address and gets alerts and digests without a subscription.
          </p>
        </form>

        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Access</th>
                <th className="px-3 py-2">Subscription</th>
                <th className="px-3 py-2">Alerts</th>
                <th className="px-3 py-2">Last sign-in</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.email}</div>
                    <div className="text-xs text-stone-500">
                      {u.name ? `${u.name} · ` : ""}
                      {u.signInMethod === "google" ? "Google" : "Email link"}
                      {u.role === "admin" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">admin</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {u.role === "admin" ? "Admin" : u.comped ? "Comped" : u.hasAccess ? "Subscriber" : "None"}
                  </td>
                  <td className="px-3 py-2">
                    {titleCase(u.subscriptionStatus)}
                    {u.subscriptionStatus === "trialing" && u.trialEndsAt && ` · ends ${formatDate(u.trialEndsAt)}`}
                  </td>
                  <td className="px-3 py-2">{u.alertCount}</td>
                  <td className="px-3 py-2 text-stone-600">{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      {u.role !== "admin" && (
                        <button className="btn-secondary !py-1" onClick={() => patch(u, { comped: !u.comped })}>
                          {u.comped ? "Revoke free access" : "Comp"}
                        </button>
                      )}
                      {u.id !== me.id && (
                        <button
                          className="btn-secondary !py-1"
                          onClick={() => patch(u, { role: u.role === "admin" ? "user" : "admin" })}
                        >
                          {u.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                      )}
                      {u.id !== me.id && (
                        <button
                          className="btn-secondary !py-1 text-red-700"
                          onClick={() => {
                            if (confirm(`Delete ${u.email} and their alerts?`)) void run(() => api(`/admin/users/${u.id}`, { method: "DELETE" }));
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500">No users match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {overview && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Sources</h2>
            <ul className="divide-y divide-stone-100 text-sm">
              {overview.sources.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-stone-600">
                    {s.last_status ?? "never run"} · {s.last_count ?? 0} records
                    {s.last_run_at && ` · ${formatDate(s.last_run_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Recent jobs</h2>
            <ul className="divide-y divide-stone-100 text-sm">
              {overview.jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{j.job}</span>
                  <span className="text-stone-600">{j.status} · {formatDate(j.started_at)}</span>
                </li>
              ))}
              {overview.jobs.length === 0 && <li className="py-2 text-stone-500">No jobs yet.</li>}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
