import pg from "pg";

/**
 * Integration tests run against a dedicated database derived from DATABASE_URL (suffix `_test`),
 * created on demand so `npm test` works against any local Postgres. Skipped when DATABASE_URL is unset.
 */
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.EMAIL_PROVIDER = "console";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.LOG_LEVEL = "silent";
process.env.APP_URL ??= "http://localhost:3000";

const base = process.env.DATABASE_URL;
if (base && !base.endsWith("_test")) {
  const url = new URL(base);
  const dbName = url.pathname.replace(/^\//, "");
  const testDb = `${dbName}_test`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${testDb}"`);
  await admin.end();
  url.pathname = `/${testDb}`;
  process.env.DATABASE_URL = url.toString();
}

if (process.env.DATABASE_URL) {
  const { runMigrations } = await import("../src/db/migrate.js");
  await runMigrations();
}
