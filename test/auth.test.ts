import { describe, it, expect } from "vitest";
import { runAuthorized } from "../src/index";
import type { Env } from "../src/types";

const u = (s: string) => new URL(s);

describe("runAuthorized (/run guard)", () => {
  it("allows when RUN_TOKEN is unset (local dev)", () => {
    expect(runAuthorized(u("https://x/run"), {} as Env)).toBe(true);
  });

  it("requires a matching key when RUN_TOKEN is set", () => {
    const env = { RUN_TOKEN: "s3cret" } as Env;
    expect(runAuthorized(u("https://x/run"), env)).toBe(false);
    expect(runAuthorized(u("https://x/run?key=wrong"), env)).toBe(false);
    expect(runAuthorized(u("https://x/run?key=s3cret"), env)).toBe(true);
  });
});
