export function money(v: string | number | null): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function amountLabel(min: string | null, max: string | null): string {
  const a = money(min);
  const b = money(max);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  if (b) return `Up to ${b}`;
  if (a) return `From ${a}`;
  return "Amount not specified";
}

export function formatDate(iso: string | null, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function deadlineLabel(deadline: string | null, deadlineText: string | null): { text: string; tone: "urgent" | "soon" | "normal" | "none" } {
  if (!deadline) return { text: deadlineText ? `Deadline: ${deadlineText}` : "Rolling / see notice", tone: "none" };
  const days = daysUntil(deadline);
  const date = formatDate(deadline) ?? deadline;
  if (days == null) return { text: date, tone: "normal" };
  if (days < 0) return { text: `Closed ${date}`, tone: "none" };
  if (days === 0) return { text: `Due today (${date})`, tone: "urgent" };
  if (days <= 14) return { text: `Due in ${days} day${days === 1 ? "" : "s"} · ${date}`, tone: "urgent" };
  if (days <= 45) return { text: `Due in ${days} days · ${date}`, tone: "soon" };
  return { text: `Due ${date}`, tone: "normal" };
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
