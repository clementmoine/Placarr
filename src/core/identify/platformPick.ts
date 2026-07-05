import { detectPlatformKey } from "@/core/identify/query";
import { PLATFORM_PICK } from "@/core/identify/evidence/scoring";

export type PlatformSignal = {
  value?: string | null;
  weight: number;
  /** One voice per source — repeated marketplace rows must not stack. */
  providerKey?: string | null;
  /** Tier-agnostic weight for decide-late pass 1. Defaults to `weight`. */
  ambiguityWeight?: number;
  /** Tier-aware weight for decide-late pass 2. Defaults to `weight`. */
  pickWeight?: number;
};

function signalAmbiguityWeight(signal: PlatformSignal): number {
  return signal.ambiguityWeight ?? signal.weight;
}

function signalPickWeight(signal: PlatformSignal): number {
  return signal.pickWeight ?? signal.weight;
}

/** Max weight per (provider, platform), then sum across providers. */
export function aggregatePlatformScores(
  signals: PlatformSignal[],
): Map<string, number> {
  const byProviderPlatform = new Map<string, number>();

  for (const signal of signals) {
    if (!signal.value?.trim()) continue;
    const platformKey = detectPlatformKey(signal.value);
    if (!platformKey) continue;

    const providerKey = signal.providerKey?.trim() || "__anonymous__";
    const bucketKey = `${providerKey}\0${platformKey}`;
    byProviderPlatform.set(
      bucketKey,
      Math.max(byProviderPlatform.get(bucketKey) ?? 0, signal.weight),
    );
  }

  const scores = new Map<string, number>();
  for (const [bucketKey, weight] of byProviderPlatform) {
    const platformKey = bucketKey.split("\0")[1]!;
    scores.set(platformKey, (scores.get(platformKey) ?? 0) + weight);
  }

  return scores;
}

function pickWinnerFromScores(scores: Map<string, number>): string | null {
  const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best) return null;
  if (second && best[1] - second[1] < PLATFORM_PICK.winnerMargin) {
    return null;
  }
  return best[0];
}

/**
 * Decide-late platform pick (provider-blind, any platform key):
 * 1. Tier-agnostic aggregation — if top scores are too close → null
 * 2. Tier-aware aggregation — winner when pass 1 was decisive
 */
export function pickPlatformKeyFromSignals(
  signals: PlatformSignal[],
): string | null {
  const ambiguityScores = aggregatePlatformScores(
    signals.map((signal) => ({
      ...signal,
      weight: signalAmbiguityWeight(signal),
    })),
  );
  if (ambiguityScores.size === 0) return null;
  if (pickWinnerFromScores(ambiguityScores) === null) return null;

  const pickScores = aggregatePlatformScores(
    signals.map((signal) => ({
      ...signal,
      weight: signalPickWeight(signal),
    })),
  );
  if (pickScores.size === 0) return null;

  return pickWinnerFromScores(pickScores);
}
