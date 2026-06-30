import type { Item, Notifier } from "../types";

export interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/** Build the Resend email payload for an item (pure; unit-tested). Alerts carry
 *  title + link + source + date only — no content summary. */
export function buildResendPayload(item: Item, from: string, to: string): ResendPayload {
  const subject = `[${item.source}] ${item.title}`.slice(0, 200);
  const text =
    `${item.source} — ${item.category}\n` +
    `${item.title}\n` +
    `${item.url}\n` +
    `Published: ${item.publishedAt}`;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html =
    `<p><strong>${esc(item.source)}</strong> — ${esc(item.category)}</p>` +
    `<p><a href="${esc(item.url)}">${esc(item.title)}</a></p>` +
    `<p>Published: ${esc(item.publishedAt)}</p>`;
  return { from, to: [to], subject, text, html };
}

/**
 * Email notifier via the Resend HTTP API (https://resend.com). Posts one email per
 * new item to `to` (default: the configured Google Group). Throws on a non-OK
 * response so the orchestrator does not mark the item seen (it re-alerts next run).
 *
 * Requirements: a Resend API key (EMAIL_API_KEY secret) and a verified sender
 * (EMAIL_FROM). The recipient group must accept mail from that sender.
 */
export function createEmailNotifier(apiKey: string, from: string, to: string): Notifier {
  return {
    id: "email",
    async notify(item: Item): Promise<void> {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildResendPayload(item, from, to)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Resend HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }
    },
  };
}
