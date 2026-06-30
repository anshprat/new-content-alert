import { describe, it, expect } from "vitest";
import { selectNotifiers } from "../src/notifiers";
import { buildConfig } from "../src/config";
import type { Env } from "../src/types";
import { silentLog } from "./helpers";

const ids = (env: Env) => selectNotifiers(buildConfig(env), silentLog).map((n) => n.id);

describe("selectNotifiers", () => {
  it("defaults to console", () => {
    expect(ids({} as Env)).toEqual(["console"]);
  });

  it("enables slack only when the webhook is set", () => {
    expect(ids({ ACTIVE_NOTIFIERS: "slack" } as Env)).toEqual(["console"]); // fallback, none valid
    expect(ids({ ACTIVE_NOTIFIERS: "console,slack", SLACK_WEBHOOK_URL: "https://h" } as Env)).toEqual([
      "console",
      "slack",
    ]);
  });

  it("enables email only when API key AND from are both set", () => {
    expect(ids({ ACTIVE_NOTIFIERS: "email", EMAIL_API_KEY: "k" } as Env)).toEqual(["console"]); // missing from -> skip -> fallback
    expect(
      ids({ ACTIVE_NOTIFIERS: "console,email", EMAIL_API_KEY: "k", EMAIL_FROM: "M <a@b.com>" } as Env),
    ).toEqual(["console", "email"]);
  });

  it("falls back to console when nothing valid is configured", () => {
    expect(ids({ ACTIVE_NOTIFIERS: "bogus" } as Env)).toEqual(["console"]);
  });
});
