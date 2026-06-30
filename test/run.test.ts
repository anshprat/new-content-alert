import { describe, it, expect } from "vitest";
import { runSource } from "../src/core/run";
import { buildConfig } from "../src/config";
import type { AdapterContext, Env, Item, SourceAdapter } from "../src/types";
import { memoryKV, recordingNotifier, silentLog } from "./helpers";

const mk = (id: string, day: string): Item => ({
  id,
  source: "RBI",
  category: "notification",
  title: `item ${id}`,
  url: `https://example.test/${id}`,
  publishedAt: `2026-06-${day}T00:00:00Z`,
});

function fakeAdapter(behavior: () => Promise<Item[]>): SourceAdapter {
  return { name: "RBI", fetchLatest: behavior };
}

function ctx(seed = false): AdapterContext {
  return {
    fetcher: {} as AdapterContext["fetcher"],
    config: buildConfig({} as Env, { seed }),
    log: silentLog,
  };
}

const KV = () => {
  const { kv, map } = memoryKV();
  return { kv: kv as unknown as KVNamespace, map };
};

describe("runSource orchestration", () => {
  it("cold start seeds WITHOUT alerting and records all items", async () => {
    const { kv, map } = KV();
    const { notifier, alerts } = recordingNotifier();
    const rep = await runSource(fakeAdapter(async () => [mk("a", "01")]), ctx(), kv, [notifier]);

    expect(rep.coldStart).toBe(true);
    expect(rep.alerted).toBe(0);
    expect(alerts).toHaveLength(0);
    expect(JSON.parse(map.get("seen:RBI")!)).toHaveProperty("a");
  });

  it("alerts only genuinely new items, then never double-alerts", async () => {
    const { kv } = KV();
    const { notifier, alerts } = recordingNotifier();
    const c = ctx();

    // seed
    await runSource(fakeAdapter(async () => [mk("a", "01")]), c, kv, [notifier]);
    // new item b appears
    const r2 = await runSource(fakeAdapter(async () => [mk("a", "01"), mk("b", "02")]), c, kv, [notifier]);
    expect(r2.alerted).toBe(1);
    expect(alerts.map((i) => i.id)).toEqual(["b"]);
    // same surface again -> nothing new
    const r3 = await runSource(fakeAdapter(async () => [mk("a", "01"), mk("b", "02")]), c, kv, [notifier]);
    expect(r3.alerted).toBe(0);
    expect(alerts).toHaveLength(1);
  });

  it("isolates failure: a throwing adapter yields ok:false without throwing", async () => {
    const { kv } = KV();
    const { notifier } = recordingNotifier();
    const rep = await runSource(
      fakeAdapter(async () => {
        throw new Error("source down");
      }),
      ctx(),
      kv,
      [notifier],
    );
    expect(rep.ok).toBe(false);
    expect(rep.error).toContain("source down");
  });

  it("incremental persist: a notifier failure re-alerts at most the in-flight item, not earlier ones", async () => {
    const { kv } = KV();
    const c = ctx();
    // seed empty so a,b,c are all 'new'
    await runSource(fakeAdapter(async () => []), c, kv, []);

    const surface = async () => [mk("a", "01"), mk("b", "02"), mk("c", "03")];

    // First real run: notifier fails on 'b'. 'a' persists; 'b' (and 'c') do not.
    const fail = recordingNotifier("b");
    const r1 = await runSource(fakeAdapter(surface), c, kv, [fail.notifier]);
    expect(r1.ok).toBe(false);
    expect(fail.alerts.map((i) => i.id)).toEqual(["a"]);

    // Second run with a healthy notifier: 'a' is NOT re-alerted; 'b' and 'c' are.
    const ok = recordingNotifier();
    const r2 = await runSource(fakeAdapter(surface), c, kv, [ok.notifier]);
    expect(r2.ok).toBe(true);
    expect(ok.alerts.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("seed mode reseeds without alerting even when the key already exists", async () => {
    const { kv } = KV();
    const { notifier, alerts } = recordingNotifier();
    await runSource(fakeAdapter(async () => [mk("a", "01")]), ctx(), kv, [notifier]);
    const rep = await runSource(fakeAdapter(async () => [mk("a", "01"), mk("z", "05")]), ctx(true), kv, [notifier]);
    expect(rep.skipped).toBe("seed-mode");
    expect(alerts).toHaveLength(0);
  });
});
