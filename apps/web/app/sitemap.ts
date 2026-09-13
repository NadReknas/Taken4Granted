import type { MetadataRoute } from "next";
import { apiGet } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const { items } = await apiGet<{ items: Array<{ slug: string; updated_at: string }> }>("/opportunities-sitemap", 3600);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/grants`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    ...items.map((i) => ({ url: `${base}/grants/${i.slug}`, lastModified: new Date(i.updated_at), changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
