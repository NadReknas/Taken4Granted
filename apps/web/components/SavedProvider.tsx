"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client";

interface SavedState {
  /** undefined while loading, null when signed out. */
  ids: Set<string> | null | undefined;
  toggle: (id: string) => Promise<void>;
}

const Ctx = createContext<SavedState>({ ids: undefined, toggle: async () => {} });

export function SavedProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ids, setIds] = useState<Set<string> | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api<{ ids: string[] }>("/saved/ids", { cache: "no-store" })
      .then((d) => {
        if (!cancelled) setIds(new Set(d.ids));
      })
      .catch((err) => {
        if (!cancelled) setIds(err instanceof ApiError && err.status === 401 ? null : new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const toggle = useCallback(
    async (id: string) => {
      if (!ids) return;
      const saved = ids.has(id);
      setIds((prev) => {
        const next = new Set(prev ?? []);
        if (saved) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        await api(`/saved/${id}`, { method: saved ? "DELETE" : "PUT", body: "{}" });
      } catch {
        setIds((prev) => {
          const next = new Set(prev ?? []);
          if (saved) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    },
    [ids],
  );

  return <Ctx.Provider value={{ ids, toggle }}>{children}</Ctx.Provider>;
}

export function useSaved(): SavedState {
  return useContext(Ctx);
}
