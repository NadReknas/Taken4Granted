"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Request a new one.",
  invalid: "That link is invalid. Request a new one.",
  google: "Google sign-in didn't complete. Try again or use an email link.",
  unverified: "Your Google account's email isn't verified. Use an email link instead.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-8 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? undefined;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api<{ google: boolean }>("/auth/providers")
      .then((p) => setGoogle(p.google))
      .catch(() => setGoogle(false));
  }, []);

  const googleHref = `/api/auth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      await api("/auth/magic-link", { method: "POST", body: JSON.stringify({ email, redirect }) });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="card mt-6">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-stone-600">
          We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
        </p>
        <button className="btn-secondary mt-4" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card mt-6 flex flex-col gap-3">
      {google && (
        <>
          <a href={googleHref} className="btn-secondary flex items-center justify-center gap-2">
            <GoogleIcon />
            Continue with Google
          </a>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-stone-400">
            <span className="h-px flex-1 bg-stone-200" />
            or
            <span className="h-px flex-1 bg-stone-200" />
          </div>
        </>
      )}
      <label className="text-sm">
        <span className="mb-1 block text-stone-600">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="you@organization.org"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" className="btn-primary" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
