import { runOnce } from "./core/run";
import type { Env } from "./types";

export default {
  /** Cron entrypoint. The whole cycle is awaited via waitUntil so it isn't cut off. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runOnce(env, {}));
  },

  /**
   * HTTP entrypoint — for local dev and manual ops (NOT the normal trigger):
   *   GET /            -> health / usage
   *   GET /run         -> run one cycle now, return the JSON report
   *   GET /run?seed=1  -> seed every enabled source WITHOUT alerting (initial seed / reseed)
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (url.pathname === "/run") {
      const seed = url.searchParams.get("seed") === "1";
      const report = await runOnce(env, { seed });
      return json(report);
    }

    if (url.pathname === "/") {
      return json({
        name: "new-content-alert",
        usage: {
          "GET /run": "run one polling cycle now and return the report",
          "GET /run?seed=1": "seed all sources without alerting (initial seed / reseed)",
        },
        note: "Normal operation is driven by the Cron Trigger (see wrangler.toml).",
      });
    }

    return json({ error: "not found" }, 404);
  },
};
