import type { Item, Logger, Notifier } from "../types";

/**
 * Email notifier STUB. Interface is wired so it can be selected via
 * ACTIVE_NOTIFIERS, but it does not send yet — it logs what it *would* send.
 * Implement against an email API (e.g. Resend/SendGrid/MailChannels) here using
 * the EMAIL_API_KEY secret. Kept as a successful no-op (not a throw) so selecting
 * it never blocks the alert pipeline.
 */
export function createEmailNotifier(_apiKey: string | undefined, log: Logger): Notifier {
  return {
    id: "email",
    async notify(item: Item): Promise<void> {
      log.warn("email notifier is a stub (not sending)", {
        wouldSend: { source: item.source, title: item.title, url: item.url },
      });
    },
  };
}
