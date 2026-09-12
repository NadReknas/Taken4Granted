export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: boolean;
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true; // network errors, timeouts, etc.
}

export function backoffDelay(attempt: number, baseMs: number, maxMs: number, factor: number, jitter: boolean): number {
  const raw = Math.min(maxMs, baseMs * Math.pow(factor, attempt));
  return jitter ? Math.round(raw / 2 + Math.random() * (raw / 2)) : raw;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 4,
    baseMs = 500,
    maxMs = 30_000,
    factor = 2,
    jitter = true,
    shouldRetry = isRetryable,
    onRetry,
    sleep = defaultSleep,
  } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const delay = backoffDelay(attempt, baseMs, maxMs, factor, jitter);
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
      attempt++;
    }
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const { timeoutMs = 20_000, fetchImpl = fetch, ...rest } = init;
  return withRetry(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...rest, signal: ctrl.signal });
      if (!res.ok) throw new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`);
      return res;
    } finally {
      clearTimeout(t);
    }
  }, opts);
}
