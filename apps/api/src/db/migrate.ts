import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./pool.js";
import { logger } from "../lib/logger.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(): Promise<string[]> {
  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("SELECT pg_advisory_lock(727272)");
    try {
      const done = new Set(
        (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
      );
      const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(migrationsDir, file), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
          await client.query("COMMIT");
          applied.push(file);
          logger.info({ migration: file }, "migration applied");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(727272)");
    }
  } finally {
    client.release();
  }
  return applied;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMigrations()
    .then((a) => {
      logger.info({ applied: a.length }, "migrations complete");
      return closePool();
    })
    .catch((err) => {
      logger.error({ err }, "migration failed");
      process.exit(1);
    });
}
