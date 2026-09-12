"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@/lib/api";

export function AuthNav() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: User | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return <span className="w-16" aria-hidden />;
  if (!user) return <Link href="/login" className="btn-primary !py-1.5">Sign in</Link>;
  return (
    <Link href="/dashboard" className="btn-secondary !py-1.5">
      Dashboard
    </Link>
  );
}
