import { runOnce } from "./core/run";
import type { Env } from "./types";

/**
 * Authorize a manual `/run` request. If RUN_TOKEN is set (production), require
 * `?key=<RUN_TOKEN>`; if unset (local dev), allow. Exported for tests.
 */
export function runAuthorized(url: URL, env: Env): boolean {
  if (!env.RUN_TOKEN) return true;
  return url.searchParams.get("key") === env.RUN_TOKEN;
}

export default {
  /** Cron entrypoint. The whole cycle is awaited via waitUntil so it isn't cut off. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runOnce(env, {}));
  },

  /**
   * HTTP entrypoint — for manual ops (NOT the normal trigger). Guarded by RUN_TOKEN:
   *   GET /              -> health / usage
   *   GET /run?key=…     -> run one cycle now, return the JSON report
   *   GET /run?key=…&seed=1 -> seed every enabled source WITHOUT alerting (initial/reseed)
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (url.pathname === "/run") {
      // Don't reveal the endpoint exists to unauthorized callers — return 404, not 401.
      if (!runAuthorized(url, env)) return json({ error: "not found" }, 404);
      const seed = url.searchParams.get("seed") === "1";
      const report = await runOnce(env, { seed });
      return json(report);
    }

    if (url.pathname === "/") {
      return json({
        name: "new-content-alert",
        usage: {
          "GET /run?key=…": "run one polling cycle now and return the report",
          "GET /run?key=…&seed=1": "seed all sources without alerting (initial seed / reseed)",
        },
        note: "Normal operation is driven by the Cron Trigger. /run requires the RUN_TOKEN key in production.",
      });
    }

    return json({ error: "not found" }, 404);
  },
};
