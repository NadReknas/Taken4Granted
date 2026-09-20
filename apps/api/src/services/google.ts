import { config } from "../lib/config.js";
import { hashToken, randomToken } from "../lib/tokens.js";
import { one, query } from "../db/pool.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_TTL_MS = 10 * 60_000;

export function googleEnabled(): boolean {
  const cfg = config();
  return !!(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET);
}

/** Redirect URI is served by the web app and proxied to the API via the `/api/*` rewrite. */
export function googleRedirectUri(): string {
  return new URL("/api/auth/google/callback", config().APP_URL).toString();
}

export async function beginGoogleLogin(redirect?: string): Promise<string> {
  const cfg = config();
  const state = randomToken(24);
  await query(`INSERT INTO oauth_states (state_hash, redirect, expires_at) VALUES ($1, $2, $3)`, [
    hashToken(state, cfg.SESSION_SECRET),
    redirect ?? null,
    new Date(Date.now() + STATE_TTL_MS),
  ]);
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", cfg.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Consumes the state token (single use); returns the stored post-login redirect. */
export async function consumeGoogleState(state: string): Promise<{ redirect: string | null } | null> {
  return one<{ redirect: string | null }>(
    `DELETE FROM oauth_states WHERE state_hash = $1 AND expires_at > now() RETURNING redirect`,
    [hashToken(state, config().SESSION_SECRET)],
  );
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const cfg = config();
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.GOOGLE_CLIENT_ID!,
      client_secret: cfg.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`google token exchange failed (${tokenRes.status})`);
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("google token exchange returned no access_token");

  const infoRes = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!infoRes.ok) throw new Error(`google userinfo failed (${infoRes.status})`);
  const info = (await infoRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.email) throw new Error("google userinfo returned no email");
  return {
    sub: info.sub,
    email: info.email,
    emailVerified: info.email_verified === true,
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}
