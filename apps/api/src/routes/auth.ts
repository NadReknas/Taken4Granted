import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../lib/config.js";
import { emailRegex } from "../lib/tokens.js";
import {
  createSession,
  publicUser,
  requestMagicLink,
  revokeSession,
  SESSION_COOKIE,
  upsertUserOnLogin,
  verifyMagicLink,
} from "../services/auth.js";
import { beginGoogleLogin, consumeGoogleState, exchangeGoogleCode, googleEnabled } from "../services/google.js";

const RELATIVE_PATH = /^\/(?!\/)/;

function safeRedirect(value: string | null | undefined): string {
  return value && RELATIVE_PATH.test(value) ? value : "/dashboard";
}

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().regex(emailRegex, "Enter a valid email address"),
  redirect: z.string().max(200).regex(RELATIVE_PATH, "redirect must be a relative path").optional(),
});

export function setSessionCookie(reply: FastifyReply, token: string, expires: Date): void {
  const cfg = config();
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.NODE_ENV === "production",
    domain: cfg.COOKIE_DOMAIN,
    expires,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  const cfg = config();
  reply.clearCookie(SESSION_COOKIE, { path: "/", domain: cfg.COOKIE_DOMAIN });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/magic-link",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
      await requestMagicLink(parsed.data.email, { redirect: parsed.data.redirect });
      return { ok: true };
    },
  );

  app.get("/auth/verify", async (req, reply) => {
    const cfg = config();
    const q = z.object({ token: z.string().min(10), redirect: z.string().optional() }).safeParse(req.query);
    if (!q.success) return reply.redirect(`${cfg.APP_URL}/login?error=invalid`);
    const result = await verifyMagicLink(q.data.token);
    if (!result) return reply.redirect(`${cfg.APP_URL}/login?error=expired`);
    setSessionCookie(reply, result.sessionToken, result.expiresAt);
    return reply.redirect(`${cfg.APP_URL}${safeRedirect(q.data.redirect)}`);
  });

  app.get("/auth/providers", async () => ({ google: googleEnabled() }));

  app.get("/auth/google", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req, reply) => {
    if (!googleEnabled()) return reply.status(404).send({ error: "Google sign-in is not configured" });
    const q = z.object({ redirect: z.string().max(200).optional() }).safeParse(req.query);
    const redirect = q.success && q.data.redirect && RELATIVE_PATH.test(q.data.redirect) ? q.data.redirect : undefined;
    return reply.redirect(await beginGoogleLogin(redirect));
  });

  app.get("/auth/google/callback", async (req, reply) => {
    const cfg = config();
    if (!googleEnabled()) return reply.status(404).send({ error: "Google sign-in is not configured" });
    const q = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(req.query);
    if (!q.success) return reply.redirect(`${cfg.APP_URL}/login?error=google`);
    const stored = await consumeGoogleState(q.data.state);
    if (!stored) return reply.redirect(`${cfg.APP_URL}/login?error=expired`);
    try {
      const profile = await exchangeGoogleCode(q.data.code);
      if (!profile.emailVerified) return reply.redirect(`${cfg.APP_URL}/login?error=unverified`);
      const user = await upsertUserOnLogin(profile.email, {
        googleSub: profile.sub,
        name: profile.name,
        avatarUrl: profile.picture,
      });
      if (!user) return reply.redirect(`${cfg.APP_URL}/login?error=google`);
      const session = await createSession(user.id);
      setSessionCookie(reply, session.sessionToken, session.expiresAt);
      return reply.redirect(`${cfg.APP_URL}${safeRedirect(stored.redirect)}`);
    } catch (err) {
      req.log.error({ err }, "google sign-in failed");
      return reply.redirect(`${cfg.APP_URL}/login?error=google`);
    }
  });

  app.post("/auth/logout", async (req, reply) => {
    await revokeSession(req.cookies[SESSION_COOKIE]);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: "Not signed in" });
    return { user: publicUser(req.user) };
  });
}
