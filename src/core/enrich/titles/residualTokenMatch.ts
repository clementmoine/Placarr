import {
  titleTokenPresentInSet,
  titleTokensEquivalent,
} from "@/core/enrich/titles/tokenEquivalents";
import { isHardwareControllerFamilyToken } from "@/core/enrich/titles/identityNoise";
import { significantTokens } from "@/core/enrich/titles/identityTokens";

export function tokensEquivalentForShelf(
  a: string,
  b: string,
  shelfType?: string | null,
): boolean {
  if (titleTokensEquivalent(a, b)) return true;
  if (
    shelfType === "hardware" &&
    isHardwareControllerFamilyToken(a) &&
    isHardwareControllerFamilyToken(b)
  ) {
    return true;
  }
  return false;
}

/**
 * "PS4" in the request is covered once the catalog already matched
 * PlayStation + 4 (and the same for PS5 / PS3 / …).
 */
export function hardwarePlatformAbbrevCoveredByMatched(
  token: string,
  matched: readonly string[],
): boolean {
  const lower = token.toLowerCase();
  const matchedSet = new Set(matched.map((entry) => entry.toLowerCase()));
  const abbrev: Record<string, [string, string]> = {
    ps1: ["playstation", "1"],
    ps2: ["playstation", "2"],
    ps3: ["playstation", "3"],
    ps4: ["playstation", "4"],
    ps5: ["playstation", "5"],
  };
  const pair = abbrev[lower];
  if (!pair) return false;
  return matchedSet.has(pair[0]) && matchedSet.has(pair[1]);
}

/**
 * Unmatched request tokens that sit *after* the matched console core — edition
 * franchise lines, not leading brand chrome ("Sony") or single color SKUs.
 */
export function hardwareRequestEditionFranchiseTokens(
  requestTokens: string[],
  matched: string[],
  requestUnmatchedSignificant: string[],
): string[] {
  if (matched.length === 0 || requestUnmatchedSignificant.length === 0) {
    return [];
  }
  let firstMatchedIdx = -1;
  for (let i = 0; i < requestTokens.length; i++) {
    if (
      matched.some((m) =>
        tokensEquivalentForShelf(requestTokens[i]!, m, "hardware"),
      )
    ) {
      firstMatchedIdx = i;
      break;
    }
  }
  if (firstMatchedIdx < 0) return requestUnmatchedSignificant;
  const leading = new Set(
    significantTokens(requestTokens.slice(0, firstMatchedIdx)),
  );
  return requestUnmatchedSignificant.filter(
    (token) => !titleTokenPresentInSet(token, leading),
  );
}

export function consumeEquivalentTokens(
  haystack: string[],
  needles: string[],
  shelfType?: string | null,
): { remaining: string[]; matched: string[] } {
  const remaining = [...haystack];
  const matched: string[] = [];
  let needleIndex = 0;
  while (needleIndex < needles.length) {
    const needle = needles[needleIndex]!;
    const nextNeedle = needles[needleIndex + 1];

    const idx = remaining.findIndex((token) =>
      tokensEquivalentForShelf(token, needle, shelfType),
    );
    if (idx >= 0) {
      matched.push(remaining[idx]!);
      remaining.splice(idx, 1);
      needleIndex += 1;
      continue;
    }

    // "joycon" ↔ adjacent "joy"+"con" (PriceCharting splits Joy-Con).
    const adjacentIdx = remaining.findIndex(
      (token, index) =>
        index + 1 < remaining.length &&
        titleTokensEquivalent(`${token}${remaining[index + 1]}`, needle),
    );
    if (adjacentIdx >= 0) {
      matched.push(needle);
      remaining.splice(adjacentIdx, 2);
      needleIndex += 1;
      continue;
    }

    // Reverse: request "joy"+"con" ↔ catalog "joycon".
    if (nextNeedle) {
      const compoundIdx = remaining.findIndex((token) =>
        titleTokensEquivalent(token, `${needle}${nextNeedle}`),
      );
      if (compoundIdx >= 0) {
        matched.push(needle, nextNeedle);
        remaining.splice(compoundIdx, 1);
        needleIndex += 2;
        continue;
      }
    }

    needleIndex += 1;
  }
  return { remaining, matched };
}
