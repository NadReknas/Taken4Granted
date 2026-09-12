import { config } from "../lib/config.js";
import { hashToken, normalizeEmail, randomToken } from "../lib/tokens.js";
import { one, query } from "../db/pool.js";
import { emailProvider, escapeHtml, layout } from "./email.js";

export interface UserRow {
  id: string;
  email: string;
  created_at: Date;
  last_login_at: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  has_access: boolean;
}

export const SESSION_COOKIE = "gr_session";

export async function requestMagicLink(rawEmail: string, opts: { redirect?: string } = {}): Promise<void> {
  const cfg = config();
  const email = normalizeEmail(rawEmail);
  const token = randomToken();
  const expires = new Date(Date.now() + cfg.MAGIC_LINK_TTL_MINUTES * 60_000);
  await query(`INSERT INTO magic_links (email, token_hash, expires_at) VALUES ($1,$2,$3)`, [
    email,
    hashToken(token, cfg.SESSION_SECRET),
    expires,
  ]);
  const url = new URL("/api/auth/verify", cfg.APP_URL);
  url.searchParams.set("token", token);
  if (opts.redirect) url.searchParams.set("redirect", opts.redirect);

  await emailProvider().send({
    to: email,
    subject: "Your sign-in link for Grant & Incentive Radar",
    text: `Click to sign in (valid ${cfg.MAGIC_LINK_TTL_MINUTES} minutes):\n\n${url.toString()}\n\nIf you did not request this, ignore this email.`,
    html: layout(
      "Sign in to Grant & Incentive Radar",
      `<p>Click the button below to sign in. This link is valid for ${cfg.MAGIC_LINK_TTL_MINUTES} minutes and can be used once.</p>
       <p><a href="${escapeHtml(url.toString())}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Sign in</a></p>
       <p style="color:#6b7280;font-size:13px">If you did not request this, you can safely ignore this email.</p>`,
    ),
  });
}

export interface VerifyResult {
  user: UserRow;
  sessionToken: string;
  expiresAt: Date;
}

/** Atomically consumes the magic link; a second use of the same token fails. */
export async function verifyMagicLink(token: string): Promise<VerifyResult | null> {
  const cfg = config();
  const link = await one<{ id: string; email: string }>(
    `UPDATE magic_links SET consumed_at = now()
     WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
     RETURNING id, email`,
    [hashToken(token, cfg.SESSION_SECRET)],
  );
  if (!link) return null;

  const user = await one<UserRow>(
    `INSERT INTO users (email, last_login_at) VALUES ($1, now())
     ON CONFLICT (email) DO UPDATE SET last_login_at = now()
     RETURNING *`,
    [link.email],
  );
  if (!user) return null;
  const session = await createSession(user.id);
  return { user, ...session };
}

export async function createSession(userId: string): Promise<{ sessionToken: string; expiresAt: Date }> {
  const cfg = config();
  const sessionToken = randomToken(48);
  const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_DAYS * 86_400_000);
  await query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, [
    userId,
    hashToken(sessionToken, cfg.SESSION_SECRET),
    expiresAt,
  ]);
  return { sessionToken, expiresAt };
}

export async function getUserBySession(sessionToken: string | undefined): Promise<UserRow | null> {
  if (!sessionToken) return null;
  const cfg = config();
  return one<UserRow>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(sessionToken, cfg.SESSION_SECRET)],
  );
}

export async function revokeSession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) return;
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(sessionToken, config().SESSION_SECRET)]);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  return one<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
}

export async function purgeExpiredAuthRows(): Promise<void> {
  await query(`DELETE FROM magic_links WHERE expires_at < now() - interval '1 day'`);
  await query(`DELETE FROM sessions WHERE expires_at < now()`);
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    subscriptionStatus: u.subscription_status,
    hasAccess: u.has_access,
    trialEndsAt: u.trial_ends_at,
    currentPeriodEnd: u.current_period_end,
    cancelAtPeriodEnd: u.cancel_at_period_end,
    hasBillingAccount: !!u.stripe_customer_id,
  };
}
