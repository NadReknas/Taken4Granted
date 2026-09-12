import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { hashToken, randomToken, safeEqual, normalizeEmail } from "../src/lib/tokens.js";
import { query } from "../src/db/pool.js";
import { captureEmail, hasDb, magicToken, teardown, truncateAll, type CapturingEmailProvider } from "./helpers.js";

describe("token primitives", () => {
  it("hashes deterministically per secret and never stores the raw token", () => {
    const t = randomToken();
    expect(t.length).toBeGreaterThan(30);
    expect(hashToken(t, "a".repeat(32))).toBe(hashToken(t, "a".repeat(32)));
    expect(hashToken(t, "a".repeat(32))).not.toBe(hashToken(t, "b".repeat(32)));
    expect(hashToken(t, "a".repeat(32))).not.toContain(t);
  });

  it("compares in constant time and normalises emails", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });
});

describe.skipIf(!hasDb)("magic-link authentication", () => {
  let app: FastifyInstance;
  let mail: CapturingEmailProvider;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    mail = captureEmail();
  });
  afterAll(async () => {
    await app.close();
    await teardown();
  });

  it("rejects invalid emails", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "not-an-email" } });
    expect(res.statusCode).toBe(400);
  });

  it("issues a one-time link, creates a session, and revokes it on logout", async () => {
    const req = await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "Jane@Example.com" } });
    expect(req.statusCode).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.last().to).toBe("jane@example.com");
    const token = magicToken(mail.last());

    const stored = await query<{ token_hash: string; consumed_at: Date | null }>("SELECT token_hash, consumed_at FROM magic_links");
    expect(stored).toHaveLength(1);
    expect(stored[0]!.token_hash).not.toBe(token);
    expect(stored[0]!.consumed_at).toBeNull();

    const verify = await app.inject({ method: "GET", url: `/auth/verify?token=${token}` });
    expect(verify.statusCode).toBe(302);
    expect(verify.headers.location).toBe("http://localhost:3000/dashboard");
    const cookie = verify.cookies.find((c) => c.name === "gr_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);

    const me = await app.inject({ method: "GET", url: "/me", cookies: { gr_session: cookie!.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: "jane@example.com", hasAccess: false, subscriptionStatus: "none" });

    // Replay of the same magic link must fail.
    const replay = await app.inject({ method: "GET", url: `/auth/verify?token=${token}` });
    expect(replay.headers.location).toBe("http://localhost:3000/login?error=expired");

    const logout = await app.inject({ method: "POST", url: "/auth/logout", cookies: { gr_session: cookie!.value } });
    expect(logout.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/me", cookies: { gr_session: cookie!.value } });
    expect(after.statusCode).toBe(401);
  });

  it("rejects expired links and forged session cookies", async () => {
    await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "late@example.com" } });
    const token = magicToken(mail.last());
    await query("UPDATE magic_links SET expires_at = now() - interval '1 minute'");
    const verify = await app.inject({ method: "GET", url: `/auth/verify?token=${token}` });
    expect(verify.headers.location).toContain("error=expired");

    const forged = await app.inject({ method: "GET", url: "/me", cookies: { gr_session: randomToken() } });
    expect(forged.statusCode).toBe(401);
  });

  it("gates alerts behind a subscription but keeps the directory public", async () => {
    await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "free@example.com" } });
    const verify = await app.inject({ method: "GET", url: `/auth/verify?token=${magicToken(mail.last())}` });
    const session = verify.cookies.find((c) => c.name === "gr_session")!.value;

    const anon = await app.inject({ method: "GET", url: "/alerts" });
    expect(anon.statusCode).toBe(401);
    const create = await app.inject({
      method: "POST",
      url: "/alerts",
      cookies: { gr_session: session },
      payload: { name: "Test", states: ["CA"] },
    });
    expect(create.statusCode).toBe(402);
    expect(create.json().code).toBe("SUBSCRIPTION_REQUIRED");

    await query("UPDATE users SET has_access = true, subscription_status = 'trialing'");
    const ok = await app.inject({ method: "POST", url: "/alerts", cookies: { gr_session: session }, payload: { name: "Test", states: ["CA"] } });
    expect(ok.statusCode).toBe(201);

    const dir = await app.inject({ method: "GET", url: "/opportunities?states=CA" });
    expect(dir.statusCode).toBe(200);
    expect(dir.json()).toMatchObject({ page: 1, items: [] });
  });
});
