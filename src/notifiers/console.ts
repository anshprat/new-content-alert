import type { Item, Logger, Notifier } from "../types";

/** Default notifier: structured log line. Used for local dev/testing and as a
 *  safe fallback so alerts are never silently dropped. */
export function createConsoleNotifier(log: Logger): Notifier {
  return {
    id: "console",
    async notify(item: Item): Promise<void> {
      log.info("ALERT", {
        source: item.source,
        category: item.category,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        id: item.id,
      });
    },
  };
}
