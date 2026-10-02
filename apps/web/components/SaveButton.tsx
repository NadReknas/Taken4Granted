"use client";

import { useSaved } from "./SavedProvider";

/** Bookmark toggle; renders nothing for signed-out visitors. */
export function SaveButton({ id, className = "" }: { id: string; className?: string }) {
  const { ids, toggle } = useSaved();
  if (!ids) return null;
  const saved = ids.has(id);
  return (
    <button
      type="button"
      onClick={() => void toggle(id)}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved grants" : "Save grant"}
      title={saved ? "Saved — click to remove" : "Save grant"}
      className={`ml-auto rounded px-1.5 text-lg leading-none ${saved ? "text-amber-500" : "text-stone-300 hover:text-amber-500"} ${className}`}
    >
      {saved ? "★" : "☆"}
    </button>
  );
}

/** Full-width save/unsave button for the grant detail page. */
export function SaveGrantButton({ id }: { id: string }) {
  const { ids, toggle } = useSaved();
  if (!ids) return null;
  const saved = ids.has(id);
  return (
    <button type="button" onClick={() => void toggle(id)} aria-pressed={saved} className="btn-secondary w-full">
      {saved ? "★ Saved — remove" : "☆ Save to my grants"}
    </button>
  );
}
