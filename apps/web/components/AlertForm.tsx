"use client";

import { useState } from "react";
import type { Meta } from "@/lib/api";
import { titleCase } from "@/lib/format";

export interface AlertDraft {
  name: string;
  states: string[];
  entityTypes: string[];
  keywords: string[];
  categories: string[];
  amountMin: number | null;
  amountMax: number | null;
  includeFederal: boolean;
  active: boolean;
}

const EMPTY: AlertDraft = {
  name: "",
  states: [],
  entityTypes: [],
  keywords: [],
  categories: [],
  amountMin: null,
  amountMax: null,
  includeFederal: true,
  active: true,
};

interface Props {
  meta: Meta;
  initial?: AlertDraft;
  onSubmit: (draft: AlertDraft) => Promise<void>;
  onCancel: () => void;
}

export function AlertForm({ meta, initial, onSubmit, onCancel }: Props) {
  const [d, setD] = useState<AlertDraft>(initial ?? EMPTY);
  const [keywords, setKeywords] = useState(initial?.keywords.join(", ") ?? "");
  const [busy, setBusy] = useState(false);

  function toggleIn(key: "states" | "entityTypes" | "categories", v: string) {
    setD((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        ...d,
        keywords: keywords.split(",").map((k) => k.trim()).filter((k) => k.length >= 2),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-5">
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Alert name</span>
        <input required maxLength={80} className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Iowa farm energy grants" />
      </label>

      <fieldset>
        <legend className="mb-1 text-sm text-stone-600">Location</legend>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.includeFederal} onChange={(e) => setD({ ...d, includeFederal: e.target.checked })} />
          Include federal / nationwide opportunities
        </label>
        <select
          multiple
          className="input h-32"
          value={d.states}
          onChange={(e) => setD({ ...d, states: Array.from(e.target.selectedOptions).map((o) => o.value) })}
        >
          {Object.entries(meta.states).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">Hold Ctrl/Cmd to pick several states. Leave empty for all states.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm text-stone-600">Applicant type</legend>
        <div className="flex flex-wrap gap-2">
          {meta.entityTypes.filter((e) => e.value !== "any").map((e) => (
            <button
              type="button"
              key={e.value}
              onClick={() => toggleIn("entityTypes", e.value)}
              className={`badge cursor-pointer ${d.entityTypes.includes(e.value) ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white"}`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm text-stone-600">Categories</legend>
        <div className="flex flex-wrap gap-2">
          {meta.categories.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => toggleIn("categories", c)}
              className={`badge cursor-pointer ${d.categories.includes(c) ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 bg-white"}`}
            >
              {titleCase(c)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Keywords (comma-separated, optional)</span>
        <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="solar, microgrid, anaerobic digester" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Target amount — minimum ($)</span>
          <input type="number" min={0} className="input" value={d.amountMin ?? ""} onChange={(e) => setD({ ...d, amountMin: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-stone-600">Target amount — maximum ($)</span>
          <input type="number" min={0} className="input" value={d.amountMax ?? ""} onChange={(e) => setD({ ...d, amountMax: e.target.value === "" ? null : Number(e.target.value) })} />
        </label>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save alert"}</button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </form>
  );
}
