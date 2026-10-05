/** fetch with timeout, retry (exponential backoff) and secret redaction in errors. */

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code: "TIMEOUT" | "HTTP" | "NETWORK" = "HTTP",
  ) {
    super(message);
  }
}

const SECRET_PARAMS = /(acl:consumerKey|consumerKey|key|api_key|apikey|token)=([^&\s]+)/gi;

/** Removes API keys from URLs / messages before they are logged or returned. */
export function redact(text: string): string {
  return text.replace(SECRET_PARAMS, "$1=***");
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 10_000, retries = 2, headers } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers });
      clearTimeout(timer);
      if (res.ok) return res;
      const err = new UpstreamError(
        `Upstream responded ${res.status} for ${redact(url)}`,
        res.status,
      );
      // do not retry client errors except 408/429
      if (res.status < 500 && res.status !== 408 && res.status !== 429) throw err;
      lastErr = err;
    } catch (err) {
      clearTimeout(timer);
      if (
        err instanceof UpstreamError &&
        err.status &&
        err.status < 500 &&
        err.status !== 429 &&
        err.status !== 408
      ) {
        throw err;
      }
      lastErr =
        err instanceof UpstreamError
          ? err
          : (err as Error)?.name === "AbortError"
            ? new UpstreamError(
                `Upstream timeout after ${timeoutMs} ms (${redact(url)})`,
                undefined,
                "TIMEOUT",
              )
            : new UpstreamError(
                `Network error for ${redact(url)}: ${redact(String((err as Error)?.message ?? err))}`,
                undefined,
                "NETWORK",
              );
    }
    if (attempt < retries) await sleep(300 * 2 ** attempt);
  }
  throw lastErr;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
