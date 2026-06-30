import type { Item } from "../types";
import type { SeenSet } from "./store";

/**
 * Return the items not already in `seen`, sorted oldest -> newest.
 *
 * Oldest-first matters for the orchestrator's incremental-persist guarantee: we
 * notify + persist in chronological order, so a crash mid-run leaves the newest
 * (most likely to recur in the source's "latest" surface) for the next tick.
 *
 * De-duplicates by id within the batch too (a few RBI feeds can repeat an item).
 */
export function diffNew(items: Item[], seen: SeenSet): Item[] {
  const fresh: Item[] = [];
  const seenInBatch = new Set<string>();
  for (const item of items) {
    if (seen[item.id] !== undefined) continue;
    if (seenInBatch.has(item.id)) continue;
    seenInBatch.add(item.id);
    fresh.push(item);
  }
  fresh.sort((a, b) => publishedMs(a) - publishedMs(b));
  return fresh;
}

function publishedMs(item: Item): number {
  const t = Date.parse(item.publishedAt);
  return Number.isFinite(t) ? t : 0;
}
