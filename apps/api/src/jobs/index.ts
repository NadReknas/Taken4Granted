import { config } from "../lib/config.js";
import { logger, type Logger } from "../lib/logger.js";
import { one, query } from "../db/pool.js";
import { loadSources } from "../sources/index.js";
import { ingestAll } from "../services/ingestion.js";
import { runDigests } from "../services/alerts.js";
import { purgeExpiredAuthRows } from "../services/auth.js";

export type JobName = "ingest" | "digest";

const LOCK_IDS: Record<JobName, number> = { ingest: 910001, digest: 910002 };

/** Runs a job exactly once cluster-wide using a Postgres advisory lock; records a job_runs row. */
export async function runJob(job: JobName, log: Logger = logger): Promise<unknown> {
  const jlog = log.child({ job });
  const lock = await one<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_IDS[job]]);
  if (!lock?.ok) {
    jlog.warn("job already running elsewhere; skipping");
    return { skipped: true };
  }
  const run = await one<{ id: string }>(`INSERT INTO job_runs (job) VALUES ($1) RETURNING id`, [job]);
  const started = Date.now();
  try {
    let detail: unknown;
    if (job === "ingest") {
      const cfg = config();
      const adapters = await loadSources(cfg.SOURCES_FILE);
      detail = await ingestAll(adapters, cfg.INGEST_MAX_PER_SOURCE, jlog);
      await purgeExpiredAuthRows();
    } else {
      detail = await runDigests(jlog);
    }
    await query(`UPDATE job_runs SET finished_at = now(), status = 'ok', detail = $2 WHERE id = $1`, [run!.id, JSON.stringify(detail)]);
    jlog.info({ durationMs: Date.now() - started, detail }, "job finished");
    return detail;
  } catch (err) {
    await query(`UPDATE job_runs SET finished_at = now(), status = 'error', detail = $2 WHERE id = $1`, [
      run!.id,
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    ]);
    jlog.error({ err }, "job failed");
    throw err;
  } finally {
    await query("SELECT pg_advisory_unlock($1)", [LOCK_IDS[job]]);
  }
}
