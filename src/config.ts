import type { Env, ResolvedConfig, SourceName } from "./types";

const ALL_SOURCES: SourceName[] = ["RBI", "IRDAI", "NPCI"];

function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Build the typed config for a run.
 *
 * Source URLs/feeds are defaulted here (confirmed live during build — see
 * VERIFICATION.md) so wrangler.toml stays small; scalar knobs come from env vars.
 * `opts.seed` forces seed-without-alert behaviour (manual reseed).
 */
export function buildConfig(env: Env, opts: { seed?: boolean } = {}): ResolvedConfig {
  const enabled = csv(env.ENABLED_SOURCES, ALL_SOURCES).filter((s): s is SourceName =>
    (ALL_SOURCES as string[]).includes(s),
  );

  return {
    enabledSources: enabled,
    activeNotifiers: csv(env.ACTIVE_NOTIFIERS, ["console"]),
    topN: int(env.TOP_N, 25),
    retentionDays: int(env.RETENTION_DAYS, 90),
    userAgent:
      env.USER_AGENT ??
      "RegulatoryUpdateMonitor/1.0 (+https://github.com/anshprat/new-content-alert)",
    fetchTimeoutMs: int(env.FETCH_TIMEOUT_MS, 10_000),
    fetchRetries: int(env.FETCH_RETRIES, 2),
    seedMode: Boolean(opts.seed),

    rbi: {
      feeds: [
        { url: "https://www.rbi.org.in/notifications_rss.xml", category: "notification" },
        { url: "https://www.rbi.org.in/pressreleases_rss.xml", category: "press_release" },
        // Optional extra feeds (uncomment to widen coverage):
        // { url: "https://www.rbi.org.in/Publication_rss.xml", category: "publication" },
        // { url: "https://www.rbi.org.in/speeches_rss.xml", category: "speech" },
      ],
    },

    irdai: {
      pages: [
        { url: "https://irdai.gov.in/circulars", category: "circular" },
        // Confirm + optionally add (markup is the same listing portlet):
        // { url: "https://irdai.gov.in/rules", category: "rule" },
        // { url: "https://irdai.gov.in/regulations", category: "regulation" },
      ],
    },

    npci: {
      baseUrl: "https://www.npci.org.in",
      // Confirmed file-listing endpoint shape (see VERIFICATION.md):
      //   GET /api/circulars/searchByName/?slug=<slug>&pageNum=1&size=<n>&sortBy=desc
      //   -> { status, data: { files: [...], totalCount } }
      listPath: "/api/circulars/searchByName/",
      // `slug` per product is the internal API key. Left blank until captured via
      // browser DevTools (steps in VERIFICATION.md); blank slugs are skipped, not errored.
      products: [
        { product: "upi", slug: "" },
        { product: "imps", slug: "" },
        { product: "rupay", slug: "" },
        { product: "nach", slug: "" },
        { product: "netc", slug: "" },
        { product: "aeps", slug: "" },
        { product: "others", slug: "" },
      ],
      pageSize: 25,
      sortBy: "desc",
    },

    slackWebhookUrl: env.SLACK_WEBHOOK_URL || undefined,
    emailApiKey: env.EMAIL_API_KEY || undefined,
    heartbeatUrl: env.HEARTBEAT_URL || undefined,
  };
}
