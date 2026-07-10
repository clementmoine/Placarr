import { buildRomanNumeralTitleVariants } from "@/core/enrich/titles/romanNumeral";

function looksLikeMultiGameBundle(title: string): boolean {
  return /\s(?:\/|&|\|)\s/.test(title);
}

/** Expands shelf/user titles into PriceCharting-friendly lookup variants. */
export function expandPriceChartingLookupTitles(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const variants = new Set<string>([cleaned]);

  const bundleNormalized = cleaned
    .replace(/\s*\/\s*/g, " & ")
    .replace(/\s*\|\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
  if (bundleNormalized !== cleaned) {
    variants.add(bundleNormalized);
  }

  for (const base of [...variants]) {
    for (const romanVariant of buildRomanNumeralTitleVariants(base)) {
      variants.add(romanVariant);
    }
  }

  if (looksLikeMultiGameBundle(cleaned) || looksLikeMultiGameBundle(bundleNormalized)) {
    for (const base of [...variants]) {
      if (/\bdouble\s*pack\b/i.test(base)) continue;
      const ampersandForm = base.replace(/\s*\/\s*/g, " & ").trim();
      variants.add(`${ampersandForm} Double Pack`);
    }
  }

  return [...variants];
}
