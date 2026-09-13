import type { FastifyInstance } from "fastify";
import { config } from "../lib/config.js";
import { billingConfigured, constructEvent, createCheckoutSession, createPortalSession, handleStripeEvent } from "../services/billing.js";
import { requireUser } from "./alerts.js";

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/billing/config", async () => ({
    configured: billingConfigured(),
    priceMonthlyUsd: 29,
    trialDays: config().TRIAL_DAYS,
  }));

  app.post("/billing/checkout", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    if (!billingConfigured()) return reply.status(503).send({ error: "Billing is not configured" });
    if (req.user!.has_access) return reply.status(400).send({ error: "You already have an active subscription" });
    return { url: await createCheckoutSession(req.user!) };
  });

  app.post("/billing/portal", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    if (!billingConfigured()) return reply.status(503).send({ error: "Billing is not configured" });
    return { url: await createPortalSession(req.user!) };
  });

  app.post("/webhooks/stripe", { config: { rateLimit: false } }, async (req, reply) => {
    const secret = config().STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];
    if (!secret || typeof signature !== "string") return reply.status(400).send({ error: "Missing signature" });
    const raw = req.body as Buffer | string | undefined;
    if (!raw) return reply.status(400).send({ error: "Empty body" });
    let event;
    try {
      event = constructEvent(raw, signature, secret);
    } catch (err) {
      req.log.warn({ err }, "stripe signature verification failed");
      return reply.status(400).send({ error: "Invalid signature" });
    }
    await handleStripeEvent(event, req.log);
    return { received: true };
  });
}
