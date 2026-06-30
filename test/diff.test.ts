import { describe, it, expect } from "vitest";
import { diffNew } from "../src/core/diff";
import { prune } from "../src/core/store";
import type { Item } from "../src/types";

const mk = (id: string, publishedAt: string): Item => ({
  id,
  source: "RBI",
  category: "notification",
  title: `item ${id}`,
  url: `https://example.test/${id}`,
  publishedAt,
});

describe("diffNew", () => {
  it("returns only unseen items, oldest -> newest", () => {
    const items = [
      mk("c", "2026-06-03T00:00:00Z"),
      mk("a", "2026-06-01T00:00:00Z"),
      mk("b", "2026-06-02T00:00:00Z"),
    ];
    const fresh = diffNew(items, { b: "2026-06-02T00:00:00Z" });
    expect(fresh.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("dedups repeated ids within the batch", () => {
    const items = [mk("a", "2026-06-01T00:00:00Z"), mk("a", "2026-06-01T00:00:00Z")];
    expect(diffNew(items, {}).map((i) => i.id)).toEqual(["a"]);
  });

  it("returns nothing when all are already seen", () => {
    const items = [mk("a", "2026-06-01T00:00:00Z")];
    expect(diffNew(items, { a: "x" })).toHaveLength(0);
  });
});

describe("prune", () => {
  const now = Date.parse("2026-06-30T00:00:00Z");
  it("drops entries older than the retention window", () => {
    const set = {
      old: "2026-01-01T00:00:00Z", // ~180 days ago
      recent: "2026-06-20T00:00:00Z",
    };
    const out = prune(set, 90, now);
    expect(out).toEqual({ recent: "2026-06-20T00:00:00Z" });
  });

  it("keeps entries with unparseable timestamps (fail-safe)", () => {
    const out = prune({ weird: "not-a-date" }, 90, now);
    expect(out).toEqual({ weird: "not-a-date" });
  });
});
