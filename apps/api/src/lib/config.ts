import { z } from "zod";

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: boolish,

  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().default(15),

  EMAIL_PROVIDER: z.enum(["resend", "console"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Grant Radar <alerts@example.com>"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  TRIAL_DAYS: z.coerce.number().default(7),

  INGEST_CRON: z.string().default("0 6 * * *"),
  DIGEST_CRON: z.string().default("0 13 * * *"),
  INGEST_MAX_PER_SOURCE: z.coerce.number().default(500),
  SOURCES_FILE: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}
