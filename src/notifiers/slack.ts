import type { Item, Notifier } from "../types";

/**
 * Slack Incoming Webhook notifier. Posts title + link + source + date — no
 * content summary (alerts are link-only by design). Throws on a non-OK response
 * so the orchestrator does not mark the item seen (it re-alerts next run).
 */
export function createSlackNotifier(webhookUrl: string): Notifier {
  return {
    id: "slack",
    async notify(item: Item): Promise<void> {
      const text =
        `:rotating_light: *${item.source}* — ${item.category}\n` +
        `<${item.url}|${item.title}>\n` +
        `_published ${item.publishedAt}_`;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, unfurl_links: false }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Slack webhook HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
    },
  };
}
