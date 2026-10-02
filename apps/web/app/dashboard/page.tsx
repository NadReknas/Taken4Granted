import type { Metadata } from "next";
import { Suspense } from "react";
import { Dashboard } from "./Dashboard";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-stone-600">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}
