/** Core type contracts shared across the monitor. */

export type SourceName = "RBI" | "IRDAI" | "NPCI";

/**
 * A normalized regulatory item. This is the only shape the core diff/notify
 * logic understands; every adapter maps its source-specific data into it.
 */
export interface Item {
  /** Stable dedup key (numeric Id/prid for RBI, documentId for IRDAI, file id/URL for NPCI). */
  id: string;
  source: SourceName;
  /** e.g. "notification" | "press_release" | "circular". */
  category: string;
  title: string;
  url: string;
  /** ISO 8601 if the source provides a parseable date, else the fetch time. */
  publishedAt: string;
}

/** Minimal logger so adapters/core can emit structured progress without console coupling. */
export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

/** Network helper handed to adapters — keeps UA/timeout/retry policy in one place. */
export interface Fetcher {
  /** GET a URL and return the body as text. Throws on non-OK / timeout after retries. */
  fetchText(url: string, init?: RequestInit): Promise<string>;
  /** GET a URL and return parsed JSON. Throws on non-OK / timeout / invalid JSON. */
  fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
}

/** Everything an adapter needs to do its job. */
export interface AdapterContext {
  fetcher: Fetcher;
  config: ResolvedConfig;
  log: Logger;
}

/**
 * A source adapter. Adding a future source = implementing this one method and
 * registering it in src/adapters/index.ts.
 */
export interface SourceAdapter {
  name: SourceName;
  fetchLatest(ctx: AdapterContext): Promise<Item[]>;
}

/** A notification sink. notify() must be idempotent-safe to retry by the caller. */
export interface Notifier {
  id: string;
  notify(item: Item): Promise<void>;
}

/** Worker bindings + raw env vars (strings, as Cloudflare delivers them). */
export interface Env {
  SEEN: KVNamespace;
  ENABLED_SOURCES?: string;
  ACTIVE_NOTIFIERS?: string;
  TOP_N?: string;
  RETENTION_DAYS?: string;
  USER_AGENT?: string;
  FETCH_TIMEOUT_MS?: string;
  FETCH_RETRIES?: string;
  // Secrets (unset unless configured):
  SLACK_WEBHOOK_URL?: string;
  EMAIL_API_KEY?: string;
  HEARTBEAT_URL?: string;
}

/** RBI feed descriptor. */
export interface RbiFeed {
  url: string;
  category: string;
}

/** A single IRDAI listing page to diff. */
export interface IrdaiPage {
  url: string;
  category: string;
}

/** Fully resolved, typed configuration (built once per run from Env). */
export interface ResolvedConfig {
  enabledSources: SourceName[];
  activeNotifiers: string[];
  topN: number;
  retentionDays: number;
  userAgent: string;
  fetchTimeoutMs: number;
  fetchRetries: number;
  seedMode: boolean;

  rbi: { feeds: RbiFeed[] };
  irdai: { pages: IrdaiPage[] };
  npci: {
    /** API origin. */
    baseUrl: string;
    /** Product path segments, e.g. ["upi","imps",...]. The product is the path segment
     *  in `/api/circulars/<product>` — there is no separate slug. */
    products: string[];
    /** Calendar years to query per product (e.g. [2026, 2025]) — covers the year-rollover. */
    years: number[];
    pageSize: number;
  };

  slackWebhookUrl?: string;
  emailApiKey?: string;
  heartbeatUrl?: string;
}

/** Per-source outcome for the run report. */
export interface SourceReport {
  source: SourceName;
  ok: boolean;
  coldStart: boolean;
  fetched: number;
  alerted: number;
  skipped?: string;
  error?: string;
}

export interface RunReport {
  startedAt: string;
  finishedAt: string;
  seedMode: boolean;
  sources: SourceReport[];
  heartbeat: "sent" | "skipped" | "failed";
}
