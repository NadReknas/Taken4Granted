import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { query } from "../src/db/pool.js";
import { upsertOpportunity } from "../src/services/ingestion.js";
import { captureEmail, hasDb, magicToken, teardown, truncateAll } from "./helpers.js";

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

async function login(app: FastifyInstance, email: string): Promise<string> {
  const mail = captureEmail();
  await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email } });
  const verify = await app.inject({ method: "GET", url: `/auth/verify?token=${magicToken(mail.sent[0]!)}` });
  return verify.cookies.find((c) => c.name === "gr_session")!.value;
}

describe.skipIf(!hasDb)("dashboard: saved grants, matches, digests", () => {
  let app: FastifyInstance;
  let cookie: string;
  let caId: string;
  let txId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    await query(`INSERT INTO sources (id, name, kind) VALUES ('test', 'Test', 'test') ON CONFLICT DO NOTHING`);
    await upsertOpportunity({ ...base, externalId: "ca", title: "CA solar", level: "state", states: ["CA"] });
    await upsertOpportunity({ ...base, externalId: "tx", title: "TX water", level: "state", states: ["TX"], categories: ["water"] });
    const ids = Object.fromEntries((await query<{ external_id: string; id: string }>(`SELECT external_id, id FROM opportunities`)).map((r) => [r.external_id, r.id]));
    caId = ids.ca!;
    txId = ids.tx!;
    cookie = await login(app, "saver@example.com");
    await query(`UPDATE users SET comped = true`);
  });
  afterAll(async () => {
    await app.close();
    await teardown();
  });

  it("requires sign-in", async () => {
    for (const url of ["/saved", "/digests", "/alerts/matches"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
  });

  it("saves, lists and unsaves opportunities idempotently", async () => {
    const c = { gr_session: cookie };
    expect((await app.inject({ method: "PUT", url: `/saved/${caId}`, cookies: c })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: `/saved/${caId}`, cookies: c })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: `/saved/00000000-0000-0000-0000-000000000000`, cookies: c })).statusCode).toBe(404);
    const list = await app.inject({ method: "GET", url: "/saved", cookies: c });
    expect(list.json().items.map((o: { id: string }) => o.id)).toEqual([caId]);
    expect((await app.inject({ method: "GET", url: "/saved/ids", cookies: c })).json().ids).toEqual([caId]);
    await app.inject({ method: "DELETE", url: `/saved/${caId}`, cookies: c });
    expect((await app.inject({ method: "GET", url: "/saved", cookies: c })).json().items).toEqual([]);
  });

  it("aggregates matches across active alerts without duplicates", async () => {
    const c = { gr_session: cookie };
    await app.inject({ method: "POST", url: "/alerts", cookies: c, payload: { name: "Energy", categories: ["energy"] } });
    await app.inject({ method: "POST", url: "/alerts", cookies: c, payload: { name: "California", states: ["CA"] } });
    await app.inject({ method: "POST", url: "/alerts", cookies: c, payload: { name: "Off", states: ["TX"], active: false } });
    const res = await app.inject({ method: "GET", url: "/alerts/matches", cookies: c });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.activeAlerts).toBe(2);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(caId);
    expect(body.items[0].matched_alerts.map((a: { name: string }) => a.name).sort()).toEqual(["California", "Energy"]);
  });

  it("lists past digests with their opportunities", async () => {
    const c = { gr_session: cookie };
    const user = (await query<{ id: string }>(`SELECT id FROM users`))[0]!;
    await query(`INSERT INTO digests (user_id, opportunity_ids) VALUES ($1, $2)`, [user.id, [caId, txId]]);
    const res = await app.inject({ method: "GET", url: "/digests", cookies: c });
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].count).toBe(2);
    expect(res.json().items[0].items.map((o: { title: string }) => o.title).sort()).toEqual(["CA solar", "TX water"]);
  });
});
