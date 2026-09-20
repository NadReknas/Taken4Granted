import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { query } from "../src/db/pool.js";
import { upsertOpportunity } from "../src/services/ingestion.js";
import { hasDb, teardown, truncateAll } from "./helpers.js";

const base = {
  sourceId: "test",
  agency: null,
  entityTypes: ["small_business"],
  categories: ["energy"],
  summary: null,
  eligibilityText: null,
  amountMin: null,
  amountMax: null,
  totalFunding: null,
  postedAt: null,
  deadline: null,
  deadlineText: null,
  applyUrl: "https://example.gov/apply",
  status: "open" as const,
  raw: {},
};

describe.skipIf(!hasDb)("GET /coverage", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await truncateAll();
    await query(`INSERT INTO sources (id, name, kind) VALUES ('test', 'Test', 'test') ON CONFLICT DO NOTHING`);
    await upsertOpportunity({ ...base, externalId: "f1", title: "Nationwide federal", level: "federal", states: [] });
    await upsertOpportunity({ ...base, externalId: "f2", title: "Iowa-only federal", level: "federal", states: ["IA"] });
    await upsertOpportunity({ ...base, externalId: "s1", title: "CA state 1", level: "state", states: ["CA"] });
    await upsertOpportunity({ ...base, externalId: "s2", title: "CA state 2", level: "state", states: ["CA"] });
    await upsertOpportunity({ ...base, externalId: "l1", title: "CA county", level: "local", states: ["CA"] });
    await upsertOpportunity({ ...base, externalId: "s3", title: "Closed OR", level: "state", states: ["OR"], status: "closed" });
  });

  afterAll(async () => {
    await app.close();
    await teardown();
  });

  it("counts nationwide federal separately and per-state by level, ignoring closed", async () => {
    const res = await app.inject({ method: "GET", url: "/coverage" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.federalNationwide).toBe(1);
    expect(body.statesWithStateGrants).toBe(1);
    expect(body.totalStates).toBe(50);
    expect(body.states).toHaveLength(52);
    const ca = body.states.find((s: { code: string }) => s.code === "CA");
    expect(ca).toMatchObject({ name: "California", state: 2, local: 1, federalTargeted: 0 });
    const ia = body.states.find((s: { code: string }) => s.code === "IA");
    expect(ia).toMatchObject({ state: 0, local: 0, federalTargeted: 1 });
    const or = body.states.find((s: { code: string }) => s.code === "OR");
    expect(or.state).toBe(0);
  });
});
