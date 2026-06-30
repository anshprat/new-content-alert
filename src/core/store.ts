import type { SourceName } from "../types";

/** id -> first-seen ISO timestamp. */
export type SeenSet = Record<string, string>;

/**
 * Minimal slice of KVNamespace we depend on. Lets tests pass a plain in-memory
 * fake without pulling in the whole Workers KV type surface.
 */
export interface SeenStoreKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const keyFor = (source: SourceName) => `seen:${source}`;

/**
 * Load a source's seen-set.
 * Returns `null` (NOT an empty object) when the key is absent — that distinction
 * is the explicit cold-start signal the orchestrator uses to seed-without-alert.
 */
export async function loadSeen(kv: SeenStoreKV, source: SourceName): Promise<SeenSet | null> {
  const raw = await kv.get(keyFor(source));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SeenSet) : {};
  } catch {
    // Corrupt value: treat as empty (not cold-start) so we don't re-flood alerts.
    return {};
  }
}

/** Drop ids whose first-seen is older than `retentionDays`, bounding KV growth. */
export function prune(set: SeenSet, retentionDays: number, now: number): SeenSet {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const out: SeenSet = {};
  for (const [id, iso] of Object.entries(set)) {
    const t = Date.parse(iso);
    // Keep entries with no/invalid timestamp (fail-safe: never silently forget).
    if (!Number.isFinite(t) || t >= cutoff) out[id] = iso;
  }
  return out;
}

/** Persist a source's seen-set, pruning stale ids first. */
export async function saveSeen(
  kv: SeenStoreKV,
  source: SourceName,
  set: SeenSet,
  retentionDays: number,
  now: number,
): Promise<void> {
  const pruned = prune(set, retentionDays, now);
  await kv.put(keyFor(source), JSON.stringify(pruned));
}
