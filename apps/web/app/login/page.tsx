import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-stone-600">No password. We&apos;ll email you a one-time link.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
