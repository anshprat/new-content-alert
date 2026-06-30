import type { Fetcher, Logger } from "./types";

/**
 * Ping an optional healthcheck URL after a successful run. Cloudflare cron has no
 * built-in retry or failure alerting, so a heartbeat (e.g. healthchecks.io) lets
 * an external monitor detect a silently dead Worker. Failure to ping is logged
 * but never fails the run.
 */
export async function pingHeartbeat(
  url: string,
  fetcher: Fetcher,
  log: Logger,
): Promise<boolean> {
  try {
    await fetcher.fetchText(url);
    log.info("heartbeat sent", { url });
    return true;
  } catch (err) {
    log.warn("heartbeat failed", { url, error: String(err) });
    return false;
  }
}
