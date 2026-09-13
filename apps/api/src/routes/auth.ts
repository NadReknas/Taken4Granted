import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../lib/config.js";
import { emailRegex } from "../lib/tokens.js";
import { publicUser, requestMagicLink, revokeSession, SESSION_COOKIE, verifyMagicLink } from "../services/auth.js";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().regex(emailRegex, "Enter a valid email address"),
  redirect: z.string().max(200).regex(/^\/(?!\/)/, "redirect must be a relative path").optional(),
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
    const redirect = q.data.redirect && /^\/(?!\/)/.test(q.data.redirect) ? q.data.redirect : "/dashboard";
    return reply.redirect(`${cfg.APP_URL}${redirect}`);
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
