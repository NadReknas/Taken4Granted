"use client";

import Link from "next/link";
import { useSaved } from "./SavedProvider";

/** Shown on the public directory when anonymous results are capped; signed-in users are pointed at the unlimited dashboard search. */
export function SignInForMore({ total, shown, query }: { total: number; shown: number; query: string }) {
  const { ids } = useSaved();
  const signedIn = ids !== null && ids !== undefined;
  return (
    <div className="card flex flex-col items-center gap-3 border-green-200 bg-green-50 text-center">
      <p className="font-semibold">
        {(total - shown).toLocaleString("en-US")} more grant{total - shown === 1 ? "" : "s"} match this search
      </p>
      {signedIn ? (
        <>
          <p className="text-sm text-stone-600">Your account has unlimited search — open this search in your dashboard.</p>
          <Link href={`/dashboard?tab=search${query ? "&" + query.slice(1) : ""}`} className="btn-primary">Open in dashboard</Link>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-600">Visitors see the first {shown}. Create a free account to search everything, save grants and set up alerts.</p>
          <Link href={`/login?redirect=${encodeURIComponent(`/grants${query}`)}`} className="btn-primary">Sign in free to see all {total.toLocaleString("en-US")}</Link>
        </>
      )}
    </div>
  );
}
