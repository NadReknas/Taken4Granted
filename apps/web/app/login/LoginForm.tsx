"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Request a new one.",
  invalid: "That link is invalid. Request a new one.",
};

export function LoginForm() {
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? undefined;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);

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
