CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE subscription_status AS ENUM (
  'none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
);

CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                citext NOT NULL UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_login_at        timestamptz,
  stripe_customer_id   text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status  subscription_status NOT NULL DEFAULT 'none',
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  has_access           boolean NOT NULL DEFAULT false
);

CREATE TABLE magic_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX magic_links_email_idx ON magic_links(email);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE sources (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  kind        text NOT NULL,
  last_run_at timestamptz,
  last_status text,
  last_error  text,
  last_count  integer
);

CREATE TABLE opportunities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        text NOT NULL REFERENCES sources(id),
  external_id      text NOT NULL,
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  agency           text,
  level            text NOT NULL CHECK (level IN ('federal','state','local','other')),
  states           text[] NOT NULL DEFAULT '{}',
  entity_types     text[] NOT NULL DEFAULT '{}',
  categories       text[] NOT NULL DEFAULT '{}',
  summary          text,
  eligibility_text text,
  amount_min       numeric(14,2),
  amount_max       numeric(14,2),
  total_funding    numeric(14,2),
  posted_at        timestamptz,
  deadline         timestamptz,
  deadline_text    text,
  apply_url        text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','forecasted')),
  raw              jsonb,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  search_tsv       tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(agency,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary,'')), 'C')
  ) STORED,
  UNIQUE (source_id, external_id)
);
CREATE INDEX opportunities_search_idx ON opportunities USING gin(search_tsv);
CREATE INDEX opportunities_deadline_idx ON opportunities(deadline);
CREATE INDEX opportunities_status_idx ON opportunities(status);
CREATE INDEX opportunities_states_idx ON opportunities USING gin(states);
CREATE INDEX opportunities_entity_idx ON opportunities USING gin(entity_types);
CREATE INDEX opportunities_first_seen_idx ON opportunities(first_seen_at DESC);

CREATE TABLE alert_criteria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  states        text[] NOT NULL DEFAULT '{}',
  entity_types  text[] NOT NULL DEFAULT '{}',
  keywords      text[] NOT NULL DEFAULT '{}',
  categories    text[] NOT NULL DEFAULT '{}',
  amount_min    numeric(14,2),
  amount_max    numeric(14,2),
  include_federal boolean NOT NULL DEFAULT true,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_criteria_user_idx ON alert_criteria(user_id);

CREATE TABLE digests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  opportunity_ids  uuid[] NOT NULL,
  provider_message_id text
);
CREATE INDEX digests_user_idx ON digests(user_id, sent_at DESC);

CREATE TABLE stripe_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE job_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job         text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL DEFAULT 'running',
  detail      jsonb
);
CREATE INDEX job_runs_job_idx ON job_runs(job, started_at DESC);
