import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Item, Logger, Notifier } from "../src/types";
import type { SeenStoreKV } from "../src/core/store";

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

export const silentLog: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** In-memory KV good enough for store/run tests (matches the bits we use). */
export function memoryKV(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  const kv: SeenStoreKV = {
    async get(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
  };
  return { kv, map };
}

/** Notifier that records every alert; optionally fails on a given id. */
export function recordingNotifier(failOnId?: string) {
  const alerts: Item[] = [];
  const notifier: Notifier = {
    id: "test",
    async notify(item) {
      if (failOnId && item.id === failOnId) throw new Error("boom");
      alerts.push(item);
    },
  };
  return { notifier, alerts };
}
