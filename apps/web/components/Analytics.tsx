"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

export function Analytics({ token, host }: { token: string; host: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthog.__loaded) {
      posthog.init(token, {
        api_host: host,
        capture_pageview: false,
        capture_pageleave: true,
        persistence: "localStorage+cookie",
      });
    }
  }, [token, host]);

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    posthog.capture("$pageview", { $current_url: window.location.origin + pathname + (query ? `?${query}` : "") });
  }, [pathname, searchParams]);

  return null;
}
