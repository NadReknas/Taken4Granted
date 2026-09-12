import { closePool } from "../db/pool.js";
import { logger } from "../lib/logger.js";
import { runMigrations } from "../db/migrate.js";
import { runJob, type JobName } from "./index.js";

const job = process.argv[2];
if (job !== "ingest" && job !== "digest") {
  logger.error({ job }, "usage: run.ts <ingest|digest>");
  process.exit(2);
}

runMigrations()
  .then(() => runJob(job as JobName))
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "job run failed");
    process.exit(1);
  });
