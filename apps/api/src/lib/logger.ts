import pino, { type LoggerOptions } from "pino";
import type { FastifyBaseLogger } from "fastify";

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "grant-radar" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: ["req.headers.authorization", "req.headers.cookie"],
};

/** Structured JSON logger shared by API, worker and CLI entrypoints. */
export const logger: FastifyBaseLogger = pino(loggerOptions);

export type Logger = FastifyBaseLogger;
