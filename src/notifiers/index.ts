import type { Logger, Notifier, ResolvedConfig } from "../types";
import { createConsoleNotifier } from "./console";
import { createSlackNotifier } from "./slack";
import { createEmailNotifier } from "./email";

/**
 * Resolve the active notifier(s) from config. Selection is env-driven
 * (ACTIVE_NOTIFIERS). If a selected notifier is missing its secret it is skipped
 * with a warning, and if nothing valid remains we fall back to console so alerts
 * are never silently dropped.
 */
export function selectNotifiers(config: ResolvedConfig, log: Logger): Notifier[] {
  const out: Notifier[] = [];
  for (const id of config.activeNotifiers) {
    switch (id) {
      case "console":
        out.push(createConsoleNotifier(log));
        break;
      case "slack":
        if (config.slackWebhookUrl) out.push(createSlackNotifier(config.slackWebhookUrl));
        else log.warn("slack notifier selected but SLACK_WEBHOOK_URL is unset; skipping");
        break;
      case "email":
        out.push(createEmailNotifier(config.emailApiKey, log));
        break;
      default:
        log.warn("unknown notifier id; ignoring", { id });
    }
  }
  if (out.length === 0) {
    log.warn("no valid notifiers configured; falling back to console");
    out.push(createConsoleNotifier(log));
  }
  return out;
}
