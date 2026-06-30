import type { Fetcher, Logger } from "./types";

export interface FetcherOptions {
  userAgent: string;
  timeoutMs: number;
  retries: number;
  log: Logger;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build a Fetcher with a descriptive UA, per-request timeout, and bounded retry
 * with exponential backoff + small jitter. Jitter both spaces out retries and
 * avoids hammering a source in lock-step (manners).
 */
export function createFetcher(opts: FetcherOptions): Fetcher {
  const { userAgent, timeoutMs, retries, log } = opts;

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "User-Agent": userAgent,
            Accept: "application/rss+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8",
            ...(init.headers ?? {}),
          },
        });
        if (!res.ok) {
          // 4xx (except 429) are not worth retrying — they won't fix themselves.
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw new Error(`HTTP ${res.status} for ${url}`);
          }
          throw new Error(`HTTP ${res.status} for ${url}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          const backoff = 300 * 2 ** attempt;
          const jitter = Math.floor(Math.random() * 250);
          log.warn(`fetch retry ${attempt + 1}/${retries}`, {
            url,
            wait: backoff + jitter,
            error: String(err),
          });
          await sleep(backoff + jitter);
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  return {
    async fetchText(url, init) {
      const res = await request(url, init);
      return res.text();
    },
    async fetchJson<T>(url: string, init?: RequestInit) {
      const res = await request(url, init);
      return (await res.json()) as T;
    },
  };
}
