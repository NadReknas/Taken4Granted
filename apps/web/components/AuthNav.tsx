"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@/lib/api";

export function AuthNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: User | null }) => {
        if (!cancelled) setUser(d.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (user === undefined) return <span className="w-16" aria-hidden />;
  if (!user) return <Link href="/login" className="btn-primary !py-1.5">Sign in</Link>;
  return (
    <Link href="/dashboard" className="btn-secondary !py-1.5">
      Dashboard
    </Link>
  );
}
