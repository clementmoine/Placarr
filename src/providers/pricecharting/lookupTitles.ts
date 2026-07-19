import { buildRomanNumeralTitleVariants } from "@/core/enrich/titles/romanNumeral";

function looksLikeMultiGameBundle(title: string): boolean {
  return /\s(?:\/|&|\|)\s/.test(title);
}

function titleTokenCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

/**
 * PriceCharting often indexes the franchise stem only ("Pokemon Yellow") while
 * shelves carry the full regional subtitle ("… Version: Special Pikachu Edition").
 * Long queries miss the catalog and soft-404 slugs onto guides — emit shorter
 * stems so seek can fall through after specific titles fail.
 */
export function expandPriceChartingFranchiseStemTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const stems = new Set<string>();
  const subtitleStem = cleaned.split(/\s*[:\-–—]\s+/)[0]?.trim();
  if (
    subtitleStem &&
    subtitleStem !== cleaned &&
    titleTokenCount(subtitleStem) >= 2
  ) {
    stems.add(subtitleStem);
  }

  for (const base of [cleaned, ...stems]) {
    const withoutVersion = base
      .replace(/\bversions?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (
      withoutVersion &&
      withoutVersion !== base &&
      titleTokenCount(withoutVersion) >= 2
    ) {
      stems.add(withoutVersion);
    }
  }

  return [...stems];
}

/**
 * PriceCharting drops the decimal point in versioned titles:
 * "Colin McRae Rally 2.0" → slug `colin-mcrae-rally-20` (not `2-0`).
 */
export function expandPriceChartingDecimalVersionTitles(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned || !/\d\.\d/.test(cleaned)) return [];

  const collapsed = cleaned.replace(/(\d)\.(\d+)/g, "$1$2");
  return collapsed !== cleaned ? [collapsed] : [];
}

/**
 * PriceCharting slug conventions are inconsistent around possessives:
 * Assassin's Creed keeps `%27s`, but "Tony Hawk's …" often drops the `'s`
 * entirely (`tony-hawk-american-wasteland`). Emit both shapes for lookup.
 */
export function expandPriceChartingPossessiveTitleVariants(
  title: string,
): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const variants = new Set<string>([cleaned]);
  const withoutPossessive = cleaned
    .replace(/['’]s\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutPossessive && withoutPossessive !== cleaned) {
    variants.add(withoutPossessive);
  }

  // "Tony Hawk's Pro Skater 4" → "Tony Hawk 4" (live PC slug: tony-hawk-4).
  for (const base of [...variants]) {
    const withoutProSkater = base
      .replace(/\bpro\s+skater\s+/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (withoutProSkater && withoutProSkater !== base) {
      variants.add(withoutProSkater);
    }
  }

  return [...variants];
}

/** Expands shelf/user titles into PriceCharting-friendly lookup variants. */
export function expandPriceChartingLookupTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const variants = new Set<string>(
    expandPriceChartingPossessiveTitleVariants(cleaned),
  );

  for (const decimal of expandPriceChartingDecimalVersionTitles(cleaned)) {
    variants.add(decimal);
  }

  for (const stem of expandPriceChartingFranchiseStemTitles(cleaned)) {
    variants.add(stem);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(stem)) {
      variants.add(possessive);
    }
  }

  const bundleNormalized = cleaned
    .replace(/\s*\/\s*/g, " & ")
    .replace(/\s*\|\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
  if (bundleNormalized !== cleaned) {
    variants.add(bundleNormalized);
    for (const possessive of expandPriceChartingPossessiveTitleVariants(
      bundleNormalized,
    )) {
      variants.add(possessive);
    }
  }

  const collapsedDecimalTitles = new Set(
    expandPriceChartingDecimalVersionTitles(cleaned),
  );

  for (const base of [...variants]) {
    // Collapsed "2.0" → "20" is for slug matching only — don't romanize to "XX".
    if (collapsedDecimalTitles.has(base)) continue;
    for (const romanVariant of buildRomanNumeralTitleVariants(base)) {
      // Skip mangled decimals ("2.0" → "II.0").
      if (/\d\.\d/.test(base) && /[IVXLCDM]+\.\d/i.test(romanVariant)) {
        continue;
      }
      variants.add(romanVariant);
    }
  }

  if (
    looksLikeMultiGameBundle(cleaned) ||
    looksLikeMultiGameBundle(bundleNormalized)
  ) {
    for (const base of [...variants]) {
      if (/\bdouble\s*pack\b/i.test(base)) continue;
      const ampersandForm = base.replace(/\s*\/\s*/g, " & ").trim();
      variants.add(`${ampersandForm} Double Pack`);
    }
  }

  return [...variants];
}
