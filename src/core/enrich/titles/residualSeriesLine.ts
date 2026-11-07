import { titleTokensEquivalent } from "@/core/enrich/titles/tokenEquivalents";
import { significantTokens } from "@/core/enrich/titles/identityTokens";

/**
 * Hyphen / spacing vs catalog compound: "Q-Force" tokens ≡ "QForce".
 * Structural join only — never invent FR↔EN aliases (rose ≠ pink).
 */
export function compactTokenStreamEquivalent(
  a: string[],
  b: string[],
): boolean {
  if (
    a.length === b.length &&
    a.every((token, index) => titleTokensEquivalent(token, b[index] ?? ""))
  ) {
    return true;
  }
  const compactA = a.join("");
  const compactB = b.join("");
  return (
    compactA.length >= 2 &&
    compactB.length >= 2 &&
    titleTokensEquivalent(compactA, compactB)
  );
}

/**
 * Ordered shared core ≥ 2 tokens (not only from index 0 — brand prefixes like
 * "Sony" must not hide a trailing color/edition line), then compare suffixes.
 * - Request line missing on candidate → sibling series / color SKU
 * - Compact suffix mismatch → sibling series (distinct markers, no invented alias)
 * - Request line ordered-prefix of candidate line with extras ("super livre")
 */
export function orderedSeriesLineConflict(
  requestTokens: string[],
  candidateTokens: string[],
):
  | "request_line_missing_on_candidate"
  | "series_suffix_mismatch"
  | "series_line_extended_on_candidate"
  | null {
  let best: {
    reqStart: number;
    candStart: number;
    length: number;
  } | null = null;

  for (let i = 0; i < requestTokens.length; i++) {
    for (let j = 0; j < candidateTokens.length; j++) {
      let length = 0;
      while (
        i + length < requestTokens.length &&
        j + length < candidateTokens.length &&
        titleTokensEquivalent(
          requestTokens[i + length]!,
          candidateTokens[j + length]!,
        )
      ) {
        length += 1;
      }
      if (length >= 2 && (!best || length > best.length)) {
        best = { reqStart: i, candStart: j, length };
      }
    }
  }
  if (!best) return null;

  const requestSuffix = requestTokens.slice(best.reqStart + best.length);
  const candidateSuffix = candidateTokens.slice(best.candStart + best.length);
  const reqSig = significantTokens(requestSuffix);
  const candSig = significantTokens(candidateSuffix);

  if (reqSig.length === 0) return null;
  if (reqSig.every((token) => /^\d+$/.test(token))) return null;

  if (candSig.length === 0) {
    return "request_line_missing_on_candidate";
  }

  // "Q-Force" vs "QForce" — same compound line, not a sibling SKU.
  if (compactTokenStreamEquivalent(reqSig, candSig)) return null;

  if (
    candSig.length > reqSig.length &&
    reqSig.every((token, index) =>
      titleTokensEquivalent(token, candSig[index] ?? ""),
    )
  ) {
    return "series_line_extended_on_candidate";
  }

  const shares = reqSig.some((token) =>
    candSig.some((other) => titleTokensEquivalent(token, other)),
  );
  if (shares) return null;

  if (reqSig.length >= 2 && candSig.length >= 2) return null;

  const isCompactLine = (suffix: string[]) =>
    suffix.length <= 2 && suffix.every((token) => token.length <= 8);

  if (isCompactLine(reqSig) || isCompactLine(candSig)) {
    return "series_suffix_mismatch";
  }
  return null;
}
