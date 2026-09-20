import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.ADMIN_EMAILS = "Owner@Example.com";

const { resetConfig } = await import("../src/lib/config.js");
resetConfig();
const { buildApp } = await import("../src/app.js");
const { query } = await import("../src/db/pool.js");
const { captureEmail, hasDb, magicToken, teardown, truncateAll } = await import("./helpers.js");

function fakeGoogle(profile: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "at" });
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) return Response.json(profile);
    throw new Error(`unexpected fetch ${url}`);
  });
}

async function googleLogin(app: FastifyInstance, profile: Record<string, unknown>, redirect?: string) {
  const start = await app.inject({ method: "GET", url: `/auth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}` });
  expect(start.statusCode).toBe(302);
  const authUrl = new URL(start.headers.location as string);
  expect(authUrl.origin + authUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(authUrl.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/google/callback");
  const state = authUrl.searchParams.get("state")!;
  const spy = fakeGoogle(profile);
  try {
    return await app.inject({ method: "GET", url: `/auth/google/callback?code=abc&state=${state}` });
  } finally {
    spy.mockRestore();
  }
}

describe.skipIf(!hasDb)("google sign-in, admins and comped access", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    captureEmail();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await teardown();
  });

  it("advertises google and signs in with a verified google account", async () => {
    const providers = await app.inject({ method: "GET", url: "/auth/providers" });
    expect(providers.json()).toEqual({ google: true });

    const cb = await googleLogin(app, { sub: "g-1", email: "Jane@Example.com", email_verified: true, name: "Jane", picture: "https://p/x.png" }, "/grants");
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe("http://localhost:3000/grants");
    const cookie = cb.cookies.find((c) => c.name === "gr_session")!;
    const me = await app.inject({ method: "GET", url: "/me", cookies: { gr_session: cookie.value } });
    expect(me.json().user).toMatchObject({ email: "jane@example.com", name: "Jane", role: "user", comped: false, hasAccess: false });
    const rows = await query<{ google_sub: string }>("SELECT google_sub FROM users");
    expect(rows[0]!.google_sub).toBe("g-1");

    // State is single-use.
    const replay = await app.inject({ method: "GET", url: cb.raw.req.url! });
    expect(replay.headers.location).toContain("error=expired");
  });

  it("rejects unverified emails and bogus state", async () => {
    const cb = await googleLogin(app, { sub: "g-2", email: "x@example.com", email_verified: false });
    expect(cb.headers.location).toContain("error=unverified");
    expect(cb.cookies.find((c) => c.name === "gr_session")).toBeUndefined();

    const bad = await app.inject({ method: "GET", url: "/auth/google/callback?code=abc&state=nope" });
    expect(bad.headers.location).toContain("error=expired");
  });

  it("links google to an existing magic-link account by email", async () => {
    const mail = captureEmail();
    await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "same@example.com" } });
    await app.inject({ method: "GET", url: `/auth/verify?token=${magicToken(mail.last())}` });
    await googleLogin(app, { sub: "g-3", email: "same@example.com", email_verified: true });
    const rows = await query<{ google_sub: string }>("SELECT google_sub FROM users");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.google_sub).toBe("g-3");
  });

  it("promotes ADMIN_EMAILS to admin with full access and guards /admin", async () => {
    const user = await googleLogin(app, { sub: "u", email: "user@example.com", email_verified: true });
    const userCookie = user.cookies.find((c) => c.name === "gr_session")!.value;
    const forbidden = await app.inject({ method: "GET", url: "/admin/users", cookies: { gr_session: userCookie } });
    expect(forbidden.statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/admin/users" })).statusCode).toBe(401);

    const admin = await googleLogin(app, { sub: "a", email: "owner@example.com", email_verified: true });
    const adminCookie = admin.cookies.find((c) => c.name === "gr_session")!.value;
    const me = await app.inject({ method: "GET", url: "/me", cookies: { gr_session: adminCookie } });
    expect(me.json().user).toMatchObject({ role: "admin", hasAccess: true });

    const alert = await app.inject({ method: "POST", url: "/alerts", cookies: { gr_session: adminCookie }, payload: { name: "A", states: ["CA"] } });
    expect(alert.statusCode).toBe(201);
    const checkout = await app.inject({ method: "POST", url: "/billing/checkout", cookies: { gr_session: adminCookie }, payload: {} });
    expect([400, 503]).toContain(checkout.statusCode);

    const list = await app.inject({ method: "GET", url: "/admin/users", cookies: { gr_session: adminCookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);
  });

  it("lets admins comp test accounts, which unlocks alerts without stripe", async () => {
    const admin = await googleLogin(app, { sub: "a", email: "owner@example.com", email_verified: true });
    const adminCookie = admin.cookies.find((c) => c.name === "gr_session")!.value;

    const created = await app.inject({ method: "POST", url: "/admin/users", cookies: { gr_session: adminCookie }, payload: { email: "Tester@Example.com" } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ email: "tester@example.com", comped: true, hasAccess: true, role: "user" });

    const tester = await googleLogin(app, { sub: "t", email: "tester@example.com", email_verified: true });
    const testerCookie = tester.cookies.find((c) => c.name === "gr_session")!.value;
    const alert = await app.inject({ method: "POST", url: "/alerts", cookies: { gr_session: testerCookie }, payload: { name: "T", states: ["CA"] } });
    expect(alert.statusCode).toBe(201);

    const revoked = await app.inject({
      method: "PATCH",
      url: `/admin/users/${created.json().id}`,
      cookies: { gr_session: adminCookie },
      payload: { comped: false },
    });
    expect(revoked.json()).toMatchObject({ comped: false, hasAccess: false });
    const denied = await app.inject({ method: "POST", url: "/alerts", cookies: { gr_session: testerCookie }, payload: { name: "T2", states: ["CA"] } });
    expect(denied.statusCode).toBe(402);

    const adminId = (await app.inject({ method: "GET", url: "/me", cookies: { gr_session: adminCookie } })).json().user.id as string;
    const self = await app.inject({ method: "PATCH", url: `/admin/users/${adminId}`, cookies: { gr_session: adminCookie }, payload: { role: "user" } });
    expect(self.statusCode).toBe(400);
  });
});
