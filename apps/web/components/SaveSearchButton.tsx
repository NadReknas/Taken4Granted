"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { AlertDraft } from "./AlertForm";
import { useSaved } from "./SavedProvider";

export function searchToDraft(v: Record<string, string | undefined>, stateNames: Record<string, string>): AlertDraft {
  const states = v.states ? v.states.split(",").filter(Boolean) : [];
  const keywords = v.q ? v.q.split(/[,\s]+/).map((k) => k.trim()).filter((k) => k.length >= 2).slice(0, 20) : [];
  const parts = [v.q, states.map((s) => stateNames[s] ?? s).join(", "), v.categories].filter(Boolean);
  return {
    name: (parts.join(" · ") || "My search").slice(0, 80),
    states,
    entityTypes: v.entityTypes ? [v.entityTypes] : [],
    keywords,
    categories: v.categories ? v.categories.split(",").filter(Boolean) : [],
    amountMin: v.minAmount ? Number(v.minAmount) : null,
    amountMax: v.maxAmount ? Number(v.maxAmount) : null,
    includeFederal: v.levels !== "state",
    active: true,
  };
}

/** Turns the current directory filters into a saved alert. Hidden for signed-out visitors. */
export function SaveSearchButton({ values, stateNames }: { values: Record<string, string | undefined>; stateNames: Record<string, string> }) {
  const { ids } = useSaved();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "paywall" | "error">("idle");
  if (!ids) return null;
  const hasFilters = ["q", "states", "entityTypes", "categories", "minAmount", "maxAmount"].some((k) => values[k]);
  if (!hasFilters) return null;

  async function save() {
    setState("busy");
    try {
      await api("/alerts", { method: "POST", body: JSON.stringify(searchToDraft(values, stateNames)) });
      router.push("/dashboard?tab=alerts");
    } catch (err) {
      setState(err instanceof ApiError && err.code === "SUBSCRIPTION_REQUIRED" ? "paywall" : "error");
    }
  }

  if (state === "paywall")
    return (
      <span className="text-sm text-stone-600">
        Alerts need a trial or subscription — <Link href="/pricing" className="underline">start a 7-day trial</Link>.
      </span>
    );
  return (
    <span className="flex items-center gap-2 text-sm">
      <button type="button" onClick={() => void save()} disabled={state === "busy"} className="btn-secondary">
        {state === "busy" ? "Saving…" : "Save this search as an alert"}
      </button>
      {state === "error" && <span className="text-red-700">Could not save — try again.</span>}
    </span>
  );
}
