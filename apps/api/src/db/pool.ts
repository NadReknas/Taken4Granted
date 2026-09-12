import pg from "pg";
import { config } from "../lib/config.js";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const cfg = config();
    pool = new pg.Pool({
      connectionString: cfg.DATABASE_URL,
      ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
