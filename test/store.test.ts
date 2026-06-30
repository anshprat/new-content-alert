import { describe, it, expect } from "vitest";
import { loadSeen, saveSeen } from "../src/core/store";
import { memoryKV } from "./helpers";

describe("loadSeen", () => {
  it("returns null for a missing key (the cold-start signal)", async () => {
    const { kv } = memoryKV();
    expect(await loadSeen(kv, "RBI")).toBeNull();
  });

  it("returns the parsed set when present", async () => {
    const { kv } = memoryKV({ "seen:RBI": JSON.stringify({ a: "2026-06-01T00:00:00Z" }) });
    expect(await loadSeen(kv, "RBI")).toEqual({ a: "2026-06-01T00:00:00Z" });
  });

  it("returns {} (NOT null) for a corrupt value, so it is not treated as cold-start", async () => {
    const { kv } = memoryKV({ "seen:RBI": "{not json" });
    expect(await loadSeen(kv, "RBI")).toEqual({});
  });
});

describe("saveSeen", () => {
  it("persists under seen:<source> and prunes stale ids", async () => {
    const { kv, map } = memoryKV();
    const now = Date.parse("2026-06-30T00:00:00Z");
    await saveSeen(
      kv,
      "IRDAI",
      { keep: "2026-06-20T00:00:00Z", drop: "2025-01-01T00:00:00Z" },
      90,
      now,
    );
    const stored = JSON.parse(map.get("seen:IRDAI") as string);
    expect(stored).toEqual({ keep: "2026-06-20T00:00:00Z" });
  });
});
