import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { computeHasAccess } from "../src/services/billing.js";
import { query } from "../src/db/pool.js";
import { captureEmail, hasDb, teardown, truncateAll, type CapturingEmailProvider } from "./helpers.js";

const SECRET = "whsec_test_secret";

function subscription(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "trialing",
    trial_end: now + 7 * 86400,
    cancel_at_period_end: false,
    ended_at: null,
    metadata: { userId: "" },
    items: { object: "list", data: [{ id: "si_1", object: "subscription_item", current_period_end: now + 7 * 86400 }] },
    ...overrides,
  };
}

function signedEvent(id: string, type: string, object: unknown): { payload: string; signature: string } {
  const payload = JSON.stringify({
    id,
    object: "event",
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, signature };
}

describe("access flag derivation", () => {
  it("grants access only for trialing/active/past_due", () => {
    expect(computeHasAccess("trialing")).toBe(true);
    expect(computeHasAccess("active")).toBe(true);
    expect(computeHasAccess("past_due")).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "none"]) expect(computeHasAccess(s)).toBe(false);
  });
});

describe.skipIf(!hasDb)("Stripe webhook endpoint", () => {
  let app: FastifyInstance;
  let mail: CapturingEmailProvider;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    mail = captureEmail();
    const rows = await query<{ id: string }>(
      `INSERT INTO users (email, stripe_customer_id) VALUES ('sub@example.com', 'cus_123') RETURNING id`,
    );
    userId = rows[0]!.id;
  });
  afterAll(async () => {
    await app.close();
    await teardown();
  });

  const post = (payload: string, signature: string) =>
    app.inject({ method: "POST", url: "/webhooks/stripe", payload, headers: { "content-type": "application/json", "stripe-signature": signature } });

  it("rejects requests with a missing, forged or stale signature", async () => {
    const { payload, signature } = signedEvent("evt_bad", "customer.subscription.created", subscription());
    expect((await post(payload, "t=1,v1=deadbeef")).statusCode).toBe(400);
    expect((await post(payload.replace("trialing", "active"), signature)).statusCode).toBe(400);
    const stale = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await post(payload, stale)).statusCode).toBe(400);
    const noHeader = await app.inject({ method: "POST", url: "/webhooks/stripe", payload, headers: { "content-type": "application/json" } });
    expect(noHeader.statusCode).toBe(400);
    const user = await query<{ has_access: boolean }>("SELECT has_access FROM users WHERE id = $1", [userId]);
    expect(user[0]!.has_access).toBe(false);
  });

  it("walks the lifecycle: created (trial) -> trial_will_end -> updated (active) -> deleted", async () => {
    const created = signedEvent("evt_1", "customer.subscription.created", subscription());
    expect((await post(created.payload, created.signature)).statusCode).toBe(200);
    let u = (await query<{ has_access: boolean; subscription_status: string; trial_ends_at: Date | null }>("SELECT * FROM users WHERE id = $1", [userId]))[0]!;
    expect(u.subscription_status).toBe("trialing");
    expect(u.has_access).toBe(true);
    expect(u.trial_ends_at).toBeInstanceOf(Date);

    const twe = signedEvent("evt_2", "customer.subscription.trial_will_end", subscription());
    expect((await post(twe.payload, twe.signature)).statusCode).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.last().to).toBe("sub@example.com");
    expect(mail.last().subject.toLowerCase()).toContain("trial");

    const active = signedEvent("evt_3", "customer.subscription.updated", subscription({ status: "active", trial_end: null }));
    expect((await post(active.payload, active.signature)).statusCode).toBe(200);
    u = (await query("SELECT * FROM users WHERE id = $1", [userId]))[0]!;
    expect(u.subscription_status).toBe("active");
    expect(u.has_access).toBe(true);

    const pastDue = signedEvent("evt_4", "customer.subscription.updated", subscription({ status: "past_due", trial_end: null }));
    await post(pastDue.payload, pastDue.signature);
    u = (await query("SELECT * FROM users WHERE id = $1", [userId]))[0]!;
    expect(u.has_access).toBe(true);

    const deleted = signedEvent("evt_5", "customer.subscription.deleted", subscription({ status: "canceled", ended_at: Math.floor(Date.now() / 1000) }));
    expect((await post(deleted.payload, deleted.signature)).statusCode).toBe(200);
    u = (await query("SELECT * FROM users WHERE id = $1", [userId]))[0]!;
    expect(u.subscription_status).toBe("canceled");
    expect(u.has_access).toBe(false);

    const events = await query<{ id: string; processed_at: Date | null }>("SELECT id, processed_at FROM stripe_events ORDER BY id");
    expect(events.map((e) => e.id)).toEqual(["evt_1", "evt_2", "evt_3", "evt_4", "evt_5"]);
    expect(events.every((e) => e.processed_at)).toBe(true);
  });

  it("ignores duplicate deliveries of the same event id", async () => {
    const created = signedEvent("evt_dup", "customer.subscription.created", subscription());
    await post(created.payload, created.signature);
    await query("UPDATE users SET has_access = false, subscription_status = 'none' WHERE id = $1", [userId]);
    expect((await post(created.payload, created.signature)).statusCode).toBe(200);
    const u = (await query<{ has_access: boolean }>("SELECT has_access FROM users WHERE id = $1", [userId]))[0]!;
    expect(u.has_access).toBe(false);
  });

  it("links a first subscription to the user via metadata when no customer id is stored yet", async () => {
    await query("UPDATE users SET stripe_customer_id = NULL WHERE id = $1", [userId]);
    const created = signedEvent("evt_meta", "customer.subscription.created", subscription({ customer: "cus_new", metadata: { userId } }));
    expect((await post(created.payload, created.signature)).statusCode).toBe(200);
    const u = (await query<{ stripe_customer_id: string; has_access: boolean }>("SELECT * FROM users WHERE id = $1", [userId]))[0]!;
    expect(u.stripe_customer_id).toBe("cus_new");
    expect(u.has_access).toBe(true);
  });
});
