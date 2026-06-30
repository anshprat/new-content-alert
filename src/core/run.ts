import { buildConfig } from "../config";
import { createFetcher } from "../fetcher";
import { getEnabledAdapters } from "../adapters";
import { selectNotifiers } from "../notifiers";
import { pingHeartbeat } from "../heartbeat";
import { loadSeen, saveSeen, type SeenSet } from "./store";
import { diffNew } from "./diff";
import type {
  AdapterContext,
  Env,
  Item,
  Logger,
  Notifier,
  ResolvedConfig,
  RunReport,
  SourceAdapter,
  SourceReport,
} from "../types";

export interface RunOptions {
  /** Force seed-without-alert (manual reseed of every enabled source). */
  seed?: boolean;
}

function makeLogger(): Logger {
  const emit = (level: string, msg: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level, msg, ...(extra ?? {}) }));
  return {
    info: (m, e) => emit("info", m, e),
    warn: (m, e) => emit("warn", m, e),
    error: (m, e) => emit("error", m, e),
  };
}

/**
 * Filter hook. Identity today — category/topic filtering (e.g. only payments)
 * is out of scope per the brief, but a filter step slots in cleanly here.
 */
function applyFilter(items: Item[], _config: ResolvedConfig): Item[] {
  return items;
}

/** Notify every active sink. Throws (after trying all) if any sink failed, so the
 *  caller does NOT persist the item — it re-alerts next run rather than being lost. */
async function notifyAll(notifiers: Notifier[], item: Item, log: Logger): Promise<void> {
  const errors: string[] = [];
  for (const n of notifiers) {
    try {
      await n.notify(item);
    } catch (err) {
      errors.push(`${n.id}: ${String(err)}`);
      log.error("notifier failed", { notifier: n.id, id: item.id, error: String(err) });
    }
  }
  if (errors.length) throw new Error(`notify failed: ${errors.join("; ")}`);
}

/** Run a single source's fetch -> diff -> notify -> persist cycle. Exported for tests. */
export async function runSource(
  adapter: SourceAdapter,
  ctx: AdapterContext,
  kv: KVNamespace,
  notifiers: Notifier[],
): Promise<SourceReport> {
  const source = adapter.name;
  const log = ctx.log;
  try {
    const items = applyFilter(await adapter.fetchLatest(ctx), ctx.config);
    const seen = await loadSeen(kv, source);
    const retention = ctx.config.retentionDays;

    // --- Cold start (no key yet) OR forced reseed: record current items, alert NONE. ---
    if (seen === null || ctx.config.seedMode) {
      const set: SeenSet = seen ?? {};
      const nowIso = new Date().toISOString();
      for (const it of items) if (set[it.id] === undefined) set[it.id] = nowIso;
      await saveSeen(kv, source, set, retention, Date.now());
      const why = seen === null ? "cold-start" : "seed-mode";
      log.info("seeded without alerting", { source, count: items.length, why });
      return { source, ok: true, coldStart: seen === null, fetched: items.length, alerted: 0, skipped: why };
    }

    // --- Normal run: alert each new item, persisting incrementally. ---
    const fresh = diffNew(items, seen); // oldest -> newest
    let alerted = 0;
    for (const item of fresh) {
      await notifyAll(notifiers, item, log); // throws on failure -> item not persisted
      seen[item.id] = new Date().toISOString();
      await saveSeen(kv, source, seen, retention, Date.now()); // persist after successful alert
      alerted++;
    }
    log.info("source ok", { source, fetched: items.length, alerted });
    return { source, ok: true, coldStart: false, fetched: items.length, alerted };
  } catch (err) {
    // Per-source isolation: log and continue. Other sources are unaffected and
    // this source's seen-state is never partially corrupted (each source = its own key).
    log.error("source failed", { source, error: String(err) });
    return { source, ok: false, coldStart: false, fetched: 0, alerted: 0, error: String(err) };
  }
}

/** Run one full polling cycle across all enabled sources. Never throws. */
export async function runOnce(env: Env, opts: RunOptions = {}): Promise<RunReport> {
  const startedAt = new Date().toISOString();
  const log = makeLogger();
  const config = buildConfig(env, opts);

  const fetcher = createFetcher({
    userAgent: config.userAgent,
    timeoutMs: config.fetchTimeoutMs,
    retries: config.fetchRetries,
    log,
  });
  const ctx: AdapterContext = { fetcher, config, log };
  const notifiers = selectNotifiers(config, log);
  const adapters = getEnabledAdapters(config);

  log.info("run started", {
    sources: config.enabledSources,
    notifiers: notifiers.map((n) => n.id),
    seedMode: config.seedMode,
  });

  const sources: SourceReport[] = [];
  for (const adapter of adapters) {
    sources.push(await runSource(adapter, ctx, env.SEEN, notifiers));
  }

  // Heartbeat: ping only if the run was meaningfully alive (>=1 source ok). If
  // every source failed (e.g. network down), skip so the healthcheck alarms.
  let heartbeat: RunReport["heartbeat"] = "skipped";
  if (config.heartbeatUrl && sources.some((s) => s.ok)) {
    heartbeat = (await pingHeartbeat(config.heartbeatUrl, fetcher, log)) ? "sent" : "failed";
  }

  const report: RunReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    seedMode: config.seedMode,
    sources,
    heartbeat,
  };
  log.info("run finished", { report });
  return report;
}
