"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";

export function SubscribeButton({ configured, label = "Start 7-day free trial" }: { configured: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/billing/checkout", { method: "POST", body: "{}" });
      window.location.assign(url);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401) {
        router.push("/login?redirect=/pricing");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start checkout");
    }
  }

  if (!configured) {
    return <p className="mt-4 text-sm text-stone-500">Billing is not configured on this deployment yet.</p>;
  }
  return (
    <div className="mt-4">
      <button onClick={go} disabled={busy} className="btn-primary w-full">
        {busy ? "Redirecting to Stripe…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
