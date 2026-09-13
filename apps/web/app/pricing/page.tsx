import type { Metadata } from "next";
import { apiGet, type BillingConfig } from "@/lib/api";
import { SubscribeButton } from "@/components/SubscribeButton";

export const metadata: Metadata = {
  title: "Pricing — grant alerts for $29/month",
  description: "One plan. Unlimited saved alert criteria, daily email digests of matching state and federal grants. 7-day free trial, cancel anytime.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const cfg = await apiGet<BillingConfig>("/billing/config", 60);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">Simple pricing</h1>
      <p className="mt-2 text-stone-700">The public directory is free. Alerts keep you from missing the ones that matter.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-semibold">Directory</h2>
          <p className="text-3xl font-bold">Free</p>
          <ul className="mt-4 space-y-2 text-sm text-stone-700">
            <li>Search every indexed federal and state opportunity</li>
            <li>Deadlines, award ranges and eligibility at a glance</li>
            <li>Direct links to the official application</li>
          </ul>
        </div>
        <div className="card border-emerald-600 ring-1 ring-emerald-600">
          <h2 className="text-lg font-semibold">Radar alerts</h2>
          <p className="text-3xl font-bold">
            ${cfg.priceMonthlyUsd}
            <span className="text-base font-normal text-stone-500">/month</span>
          </p>
          <p className="text-sm text-emerald-800">{cfg.trialDays}-day free trial · card required · cancel anytime</p>
          <ul className="mt-4 space-y-2 text-sm text-stone-700">
            <li>Unlimited saved criteria: states, applicant type, categories, keywords, award range</li>
            <li>Daily email digest of new matches — one email, no noise</li>
            <li>Preview matches instantly before you save</li>
            <li>Manage or cancel yourself in the Stripe billing portal</li>
          </ul>
          <SubscribeButton configured={cfg.configured} />
        </div>
      </div>

      <section className="mt-10 text-sm text-stone-700">
        <h2 className="text-base font-semibold text-stone-900">How the trial works</h2>
        <p className="mt-1">
          You enter a card at checkout and are not charged for {cfg.trialDays} days. We email you before the trial ends. Cancel from the
          billing portal any time before then and you pay nothing.
        </p>
      </section>
    </div>
  );
}
