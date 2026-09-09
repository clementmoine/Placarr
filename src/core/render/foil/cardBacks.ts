import { getEffectPack } from "./registry";

/** How specific a proposed card back is — drives default ranking. */
export type CardBackScope = "print" | "set" | "pack";

export type CardBackCandidate = {
  url: string;
  scope: CardBackScope;
  /** set code when scope is set; printKey when scope is print */
  key?: string | null;
  /** provider id or `"effect-pack"` */
  source?: string | null;
};

const SCOPE_RANK: Record<CardBackScope, number> = {
  print: 0,
  set: 1,
  pack: 2,
};

function nonEmptyUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Sort proposed backs: print (alt face) > set > pack. Stable within a scope.
 */
export function rankCardBacks(
  candidates: readonly CardBackCandidate[],
): CardBackCandidate[] {
  return [...candidates].sort((a, b) => {
    const byScope = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
    if (byScope !== 0) return byScope;
    return a.url.localeCompare(b.url);
  });
}

/** Default back = highest-ranked candidate, or null if none. */
export function pickDefaultCardBack(
  candidates: readonly CardBackCandidate[],
): CardBackCandidate | null {
  const ranked = rankCardBacks(candidates);
  return ranked[0] ?? null;
}

/**
 * Build the candidate list for one item/print: provider print URL, optional
 * pack set resolve, then pack default (contract).
 */
export function resolveCardBackCandidates(opts: {
  printCardBackUrl?: string | null;
  printKey?: string | null;
  setCode?: string | null;
  effectPackId?: string | null;
  /** Stamped on provider-sourced candidates when known. */
  providerId?: string | null;
}): CardBackCandidate[] {
  const out: CardBackCandidate[] = [];
  const printUrl = nonEmptyUrl(opts.printCardBackUrl);
  if (printUrl) {
    out.push({
      url: printUrl,
      scope: "print",
      key: opts.printKey ?? null,
      source: opts.providerId ?? null,
    });
  }

  const pack = getEffectPack(opts.effectPackId);
  if (!pack) return out;

  const fromResolve = nonEmptyUrl(
    pack.resolveCardBack?.({
      setCode: opts.setCode,
      printKey: opts.printKey,
    }) ?? null,
  );
  if (fromResolve) {
    out.push({
      url: fromResolve,
      scope: "set",
      key: opts.setCode ?? opts.printKey ?? null,
      source: "effect-pack",
    });
  }

  const packDefault = nonEmptyUrl(pack.cardBackUrl);
  if (packDefault) {
    out.push({
      url: packDefault,
      scope: "pack",
      source: "effect-pack",
    });
  }

  return out;
}

/**
 * Shared skeleton URL: only pack/set backs (one image for thousands of cards).
 * Print-scoped alt faces are unique — not worth preloading as a grid placeholder.
 */
export function sharedCardBackSkeletonUrl(
  candidate: CardBackCandidate | null | undefined,
): string | null {
  if (!candidate) return null;
  if (candidate.scope === "print") return null;
  return candidate.url;
}

/**
 * Pack/set back for a loading tile — never the print alt face.
 *
 * `resolveDefaultCardBack` prefers print > set > pack (correct for flip UI).
 * Feeding that into {@link sharedCardBackSkeletonUrl} returns null whenever a
 * print back exists, so the shelf grid showed no placeholder on those cards.
 * Skeleton only needs the shared catalogue back.
 */
export function resolveSharedCardBackSkeleton(
  opts: Parameters<typeof resolveCardBackCandidates>[0],
): string | null {
  const shared = resolveCardBackCandidates(opts).filter(
    (c) => c.scope !== "print",
  );
  return sharedCardBackSkeletonUrl(pickDefaultCardBack(shared));
}
