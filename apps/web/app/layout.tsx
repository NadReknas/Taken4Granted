import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthNav } from "@/components/AuthNav";
import { Logo } from "@/components/Logo";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Grant Retriever", template: "%s · Grant Retriever" },
  description:
    "Grant Retriever fetches every open state and federal sustainability and rural business grant daily — deadlines, eligibility and official application links — and brings the matches to your inbox.",
  openGraph: { type: "website", siteName: "Grant Retriever" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-stone-900">
              <Logo />
              Grant Retriever
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/grants" className="text-stone-700 hover:text-stone-900">Directory</Link>
              <Link href="/pricing" className="text-stone-700 hover:text-stone-900">Pricing</Link>
              <AuthNav />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:justify-between">
            <p>Fetched daily from Grants.gov and state grant portals. Always confirm details on the official notice.</p>
            <p>
              <Link href="/grants" className="hover:text-stone-700">Browse grants</Link> · <Link href="/pricing" className="hover:text-stone-700">Alerts</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
