import type { ResolvedConfig, SourceAdapter, SourceName } from "../types";
import { rbiAdapter } from "./rbi";
import { irdaiAdapter } from "./irdai";
import { npciAdapter } from "./npci";

/** Registry of all known adapters, keyed by source name. */
const REGISTRY: Record<SourceName, SourceAdapter> = {
  RBI: rbiAdapter,
  IRDAI: irdaiAdapter,
  NPCI: npciAdapter,
};

/** Adapters for the sources enabled in config, in the order listed. */
export function getEnabledAdapters(config: ResolvedConfig): SourceAdapter[] {
  return config.enabledSources.map((s) => REGISTRY[s]).filter(Boolean);
}

export { rbiAdapter, irdaiAdapter, npciAdapter };
