/**
 * Shared TCGdex ↔ Live join for foil resolve.
 * Live sqlite confirms / recovers bundles; cards.json remains the shader source.
 */
import type { LiveCardRow } from "./liveCardsLookups";
import { lookupByBundle } from "./liveCardsLookups";
import {
  resolveEffectForPrintKey,
  type PaperEffectResolution,
} from "./resolveEffect";

export type LiveJoinResult = {
  resolution: PaperEffectResolution;
  /** Identity row when sqlite is present (bundle preferred). */
  liveRow: LiveCardRow | null;
};

/**
 * Resolve foil for a catalogue print and attach Live identity when available.
 */
export function joinLiveForPrint(input: {
  printKey: string | null | undefined;
  finish: string | null | undefined;
  lang?: string | null;
  name?: string | null;
}): LiveJoinResult | null {
  const resolution = resolveEffectForPrintKey(
    input.printKey,
    input.finish,
    input.lang ?? "fr",
    input.name,
  );
  if (!resolution) return null;
  const liveRow = lookupByBundle(resolution.bundle);
  return { resolution, liveRow };
}
