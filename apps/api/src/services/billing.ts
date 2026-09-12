import Stripe from "stripe";
import { config } from "../lib/config.js";
import { logger, type Logger } from "../lib/logger.js";
import { one, query } from "../db/pool.js";
import { emailProvider, escapeHtml, layout } from "./email.js";
import type { UserRow } from "./auth.js";

let stripeClient: Stripe | undefined;

export function stripe(): Stripe {
  if (!stripeClient) {
    const key = config().STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/** Signature verification does not call Stripe, so it works even before STRIPE_SECRET_KEY is set. */
const webhookVerifier = () => new Stripe(config().STRIPE_SECRET_KEY ?? "sk_test_placeholder");

export function setStripeClient(c: Stripe | undefined): void {
  stripeClient = c;
}

export function billingConfigured(): boolean {
  const c = config();
  return !!(c.STRIPE_SECRET_KEY && c.STRIPE_PRICE_ID && c.STRIPE_WEBHOOK_SECRET);
}

/** Statuses that grant product access. `past_due` keeps access during Stripe's dunning window. */
export const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"]);

export function computeHasAccess(status: string): boolean {
  return ACCESS_STATUSES.has(status);
}

export async function ensureCustomer(user: UserRow): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripe().customers.create({ email: user.email, metadata: { userId: user.id } });
  await query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1 AND stripe_customer_id IS NULL`, [user.id, customer.id]);
  const fresh = await one<{ stripe_customer_id: string }>(`SELECT stripe_customer_id FROM users WHERE id = $1`, [user.id]);
  return fresh?.stripe_customer_id ?? customer.id;
}

export async function createCheckoutSession(user: UserRow): Promise<string> {
  const cfg = config();
  const customer = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: cfg.STRIPE_PRICE_ID!, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: {
      trial_period_days: cfg.TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: { userId: user.id },
    },
    allow_promotion_codes: true,
    success_url: `${cfg.APP_URL}/dashboard?checkout=success`,
    cancel_url: `${cfg.APP_URL}/pricing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(user: UserRow): Promise<string> {
  const customer = await ensureCustomer(user);
  const session = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${config().APP_URL}/dashboard`,
  });
  return session.url;
}

const toDate = (unix: number | null | undefined): Date | null => (unix ? new Date(unix * 1000) : null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function metadataUserId(sub: Stripe.Subscription): string | null {
  const v = sub.metadata?.userId;
  return v && UUID_RE.test(v) ? v : null;
}

function periodEnd(sub: Stripe.Subscription): number | null {
  const item = sub.items.data[0];
  return item?.current_period_end ?? null;
}

export async function applySubscription(sub: Stripe.Subscription, log: Logger = logger): Promise<UserRow | null> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const status = sub.status;
  const user = await one<UserRow>(
    `UPDATE users SET
       stripe_subscription_id = $2,
       subscription_status = $3::subscription_status,
       trial_ends_at = $4,
       current_period_end = $5,
       cancel_at_period_end = $6,
       has_access = $7
     WHERE stripe_customer_id = $1
        OR (stripe_customer_id IS NULL AND id = $8)
     RETURNING *`,
    [
      customerId,
      sub.id,
      status,
      toDate(sub.trial_end),
      toDate(periodEnd(sub)),
      sub.cancel_at_period_end,
      computeHasAccess(status),
      metadataUserId(sub),
    ],
  );
  if (!user) {
    log.warn({ customerId, subscription: sub.id }, "subscription event for unknown customer");
    return null;
  }
  if (!user.stripe_customer_id) {
    await query(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [user.id, customerId]);
  }
  log.info({ userId: user.id, status, hasAccess: computeHasAccess(status) }, "subscription applied");
  return user;
}

export async function applySubscriptionDeleted(sub: Stripe.Subscription, log: Logger = logger): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = await one<UserRow>(
    `UPDATE users SET subscription_status = 'canceled', has_access = false, cancel_at_period_end = false,
       current_period_end = $2
     WHERE stripe_customer_id = $1 AND (stripe_subscription_id = $3 OR stripe_subscription_id IS NULL)
     RETURNING *`,
    [customerId, toDate(sub.ended_at ?? periodEnd(sub)), sub.id],
  );
  log.info({ userId: user?.id, subscription: sub.id }, "subscription deleted");
}

export async function notifyTrialWillEnd(sub: Stripe.Subscription, log: Logger = logger): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = await one<UserRow>(`SELECT * FROM users WHERE stripe_customer_id = $1`, [customerId]);
  if (!user) return;
  const ends = toDate(sub.trial_end);
  const when = ends ? ends.toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "in 3 days";
  const portal = `${config().APP_URL}/dashboard`;
  await emailProvider().send({
    to: user.email,
    subject: "Your Grant Radar trial ends soon",
    text: `Your free trial ends ${when}. Your card on file will be charged $29/month afterwards. Manage or cancel any time: ${portal}`,
    html: layout(
      "Your free trial ends soon",
      `<p>Your 7-day trial ends <strong>${escapeHtml(when)}</strong>. After that your card on file is charged <strong>$29/month</strong> and your alerts keep flowing.</p>
       <p>Want to cancel? No problem — it takes one click. <a href="${escapeHtml(portal)}">Manage subscription</a></p>`,
    ),
  });
  log.info({ userId: user.id }, "trial-will-end notice sent");
}

/**
 * Idempotent: returns false if this event id was already processed.
 * An event that was received but failed mid-processing (processed_at IS NULL) can be claimed again by Stripe's retry.
 */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const rows = await query(
    `INSERT INTO stripe_events (id, type) VALUES ($1,$2)
     ON CONFLICT (id) DO UPDATE SET received_at = now() WHERE stripe_events.processed_at IS NULL
     RETURNING id`,
    [event.id, event.type],
  );
  return rows.length > 0;
}

export async function markEventProcessed(id: string): Promise<void> {
  await query(`UPDATE stripe_events SET processed_at = now() WHERE id = $1`, [id]);
}

export async function handleStripeEvent(event: Stripe.Event, log: Logger = logger): Promise<void> {
  const elog = log.child({ eventId: event.id, type: event.type });
  if (!(await claimEvent(event))) {
    elog.info("duplicate stripe event ignored");
    return;
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe().subscriptions.retrieve(subId);
        await applySubscription(sub, elog);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscription(event.data.object, elog);
      break;
    case "customer.subscription.trial_will_end":
      await applySubscription(event.data.object, elog);
      await notifyTrialWillEnd(event.data.object, elog);
      break;
    case "customer.subscription.deleted":
      await applySubscriptionDeleted(event.data.object, elog);
      break;
    default:
      elog.debug("unhandled stripe event type");
  }
  await markEventProcessed(event.id);
}

export function constructEvent(rawBody: string | Buffer, signature: string, secret: string): Stripe.Event {
  return webhookVerifier().webhooks.constructEvent(rawBody, signature, secret);
}
