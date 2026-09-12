import type { FastifyInstance } from "fastify";
import {
  CATEGORIES,
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  LEVELS,
  US_STATES,
} from "../domain/opportunity.js";
import {
  directoryStats,
  getOpportunityBySlug,
  listSlugsForSitemap,
  searchOpportunities,
  searchParamsSchema,
} from "../services/opportunities.js";

export async function registerOpportunityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/opportunities", async (req, reply) => {
    const parsed = searchParamsSchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid query", issues: parsed.error.issues });
    reply.header("cache-control", "public, max-age=60, s-maxage=300");
    return searchOpportunities(parsed.data);
  });

  app.get<{ Params: { slug: string } }>("/opportunities/:slug", async (req, reply) => {
    const row = await getOpportunityBySlug(req.params.slug);
    if (!row) return reply.status(404).send({ error: "Not found" });
    reply.header("cache-control", "public, max-age=300, s-maxage=600");
    return row;
  });

  app.get("/opportunities-sitemap", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=3600");
    return { items: await listSlugsForSitemap() };
  });

  app.get("/stats", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return directoryStats();
  });

  app.get("/meta", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=86400");
    return {
      states: US_STATES,
      entityTypes: ENTITY_TYPES.map((v) => ({ value: v, label: ENTITY_TYPE_LABELS[v] })),
      categories: CATEGORIES,
      levels: LEVELS,
    };
  });
}
