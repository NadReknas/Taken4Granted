# Grant & Incentive Radar

Automated aggregator and alert service for state and federal sustainability / rural business grants.

- **Scheduled ingestion worker** pulls open + forecasted notices daily from Grants.gov and the California Grants Portal (plus a generic RSS/Atom adapter), normalises deadlines, eligibility and award ranges, and indexes them in PostgreSQL.
- **Alert engine** matches new opportunities against each subscriber's saved criteria (states, applicant type, category, keywords, award range) and sends one deduplicated email digest per user via Resend.
- **Public directory** — fast, server-rendered, SEO-friendly search with clear deadlines and direct official application links.
- **Billing** — single $29/month plan, strict 7-day trial with card up front, Stripe Checkout + Billing Portal, webhook-driven access gating (`users.has_access`).

## Stack

| Layer     | Tech                                                                      |
| --------- | ------------------------------------------------------------------------- |
| API       | Node 20, TypeScript, Fastify 5, Zod, `pg`, Stripe SDK, Pino JSON logs     |
| Worker    | Same image as API, `node-cron` schedule, exponential-backoff HTTP retries |
| Web       | Next.js 15 (App Router), React 19, Tailwind CSS 4                         |
| Database  | PostgreSQL 14+ (Supabase / Neon / Railway), plain SQL migrations          |
| Auth      | Passwordless email magic links, HMAC-hashed tokens, HTTP-only cookie      |
| Email     | Resend (or `console` provider for local dev)                              |
| Tests     | Vitest (API): auth, ingestion schemas/adapters, search, Stripe webhooks   |

```
apps/api   Fastify API + worker (src/server.ts, src/worker.ts)
apps/web   Next.js frontend (proxies /api/* to the Fastify API)
```

## Quick start (local)

Requirements: Node 20+, Docker (for Postgres) or any PostgreSQL 14+.

```bash
cp .env.example .env            # edit SESSION_SECRET at minimum
docker run -d --name gr-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=grant_radar postgres:16-alpine
npm install
npm run migrate                 # applies apps/api/src/db/migrations/*.sql (also runs on API/worker boot)
npm run ingest                  # one-off pull from all enabled sources (~1–2 min)
npm run dev                     # API on :4000, web on :3000
```

Open http://localhost:3000. With `EMAIL_PROVIDER=console`, magic links and digests are printed to the API log.

Useful commands:

```bash
npm run test        # vitest (uses <DATABASE_URL>_test, created automatically)
npm run lint
npm run typecheck
npm run build
npm run digest      # send digests for alerts with new matches
```

Manual job triggers (useful for Railway/Fly cron instead of the long-running worker):

```bash
curl -X POST -H "authorization: Bearer $CRON_SECRET" $API_URL/jobs/ingest
curl -X POST -H "authorization: Bearer $CRON_SECRET" $API_URL/jobs/digest
```

## Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Starts `db`, `api` (:4000), `worker` and `web` (:3000). Migrations run automatically on boot behind an advisory lock, so multiple replicas are safe.

## Stripe setup

1. Create a product with a recurring **$29 / month** price → set `STRIPE_PRICE_ID`.
2. Enable the [Customer Portal](https://dashboard.stripe.com/settings/billing/portal) and allow cancellation / payment-method updates there. The app never implements its own cancel flow.
3. Add a webhook endpoint `POST https://<api-host>/webhooks/stripe` subscribed to:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.trial_will_end`, `customer.subscription.deleted` → set `STRIPE_WEBHOOK_SECRET`.
4. Local testing: `stripe listen --forward-to localhost:4000/webhooks/stripe`.

Lifecycle: Checkout (`mode=subscription`, `trial_period_days=7`, `payment_method_collection=always`) →
`customer.subscription.created` sets `subscription_status=trialing`, `has_access=true` → `trial_will_end` emails a
reminder 3 days before → `updated` flips to `active` / `past_due` / `unpaid` → `deleted` sets `canceled`,
`has_access=false`. Access = `trialing | active | past_due`. Events are verified against the raw body and
stored in `stripe_events` for idempotency.

## Deploy (Railway)

Railway builds one Dockerfile per service and has no stage/target selector, so the `api` and `web` targets are also
available as standalone files in `deploy/railway/`. Create one Postgres service and three GitHub services from this repo:

| Service | `RAILWAY_DOCKERFILE_PATH`        | Start command          | Key variables                                              |
| ------- | -------------------------------- | ---------------------- | ---------------------------------------------------------- |
| api     | `deploy/railway/Dockerfile.api`  | default                | `HOST=::`, `DATABASE_URL`, `APP_URL`, `API_URL`, secrets   |
| worker  | `deploy/railway/Dockerfile.api`  | `node dist/worker.js`  | same as api, no public domain                              |
| web     | `deploy/railway/Dockerfile.web`  | default                | `API_URL=http://api.railway.internal:4000`, `APP_URL`      |

`HOST=::` makes the API listen on IPv6, which Railway's private network requires. `API_URL` on `web` is baked in at
build time (it configures the `/api/*` rewrite), so redeploy `web` if it changes. Set `APP_URL` to the public web domain
and `API_URL` on `api`/`worker` to the public API domain; enable `DATABASE_SSL=true` only for external Postgres providers.

For Fly.io, use the same three processes: `fly launch --dockerfile Dockerfile --build-target api` and add a
`[processes]` block with `api = "node dist/server.js"` and `worker = "node dist/worker.js"`.

## Operations

- `GET /healthz` — liveness + DB ping. `GET /readyz` — readiness.
- All logs are structured JSON (Pino). Every ingestion run is recorded in `source_runs` with status, counts and error.
- External fetches use `fetchWithRetry` (exponential backoff with jitter, 20 s timeout, retries on 429/5xx and network errors).
- Stale/expired opportunities are marked `closed`, never deleted, so public URLs stay stable.
- Add sources in `apps/api/config/sources.json` (kinds: `grants_gov`, `ca_grants`, `rss`); no code change needed.

## Environment variables

See [`.env.example`](.env.example) — every variable is documented there and validated on boot by `apps/api/src/lib/config.ts`.
