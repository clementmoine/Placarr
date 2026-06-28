import { buildRomanNumeralTitleVariants, buildRomanRangeTitleVariants } from "@/lib/title/romanNumeral";
import { createGameEditionMatcher } from "@/lib/barcode/listingTerms";
import {
  TITLE_PHRASE_EQUIVALENT_GROUPS,
  TITLE_TOKEN_EQUIVALENT_GROUPS,
} from "@/lib/title/tokenEquivalents";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyTokenCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Swaps equivalent tokens (colours, etc.) using shared title-token groups. */
export function buildTokenEquivalentTitleVariants(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  const seen = new Set([trimmed.toLowerCase()]);
  const frontier = [trimmed];

  while (frontier.length > 0) {
    const current = frontier.pop()!;
    const lower = current.toLowerCase();

    for (const group of TITLE_TOKEN_EQUIVALENT_GROUPS) {
      for (const token of group) {
        const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
        if (!pattern.test(lower)) continue;

        for (const alt of group) {
          if (alt.toLowerCase() === token.toLowerCase()) continue;
          const swapped = current.replace(pattern, (match) =>
            applyTokenCase(match, alt),
          );
          const key = swapped.toLowerCase();
          if (key === trimmed.toLowerCase() || seen.has(key)) continue;
          seen.add(key);
          variants.add(swapped);
          frontier.push(swapped);
        }
      }
    }
  }

  return [...variants];
}

const MAX_PHRASE_EQUIVALENT_VARIANTS = 48;

/** Swaps multi-word FR/EN subtitle phrases for provider search retries. */
export function buildPhraseEquivalentTitleVariants(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  const seen = new Set([trimmed.toLowerCase()]);
  // Depth 2 only: phrase swaps chain once (FR subtitle + EN subtitle) but never recurse further.
  const frontier: Array<{ value: string; depth: number }> = [
    { value: trimmed, depth: 0 },
  ];

  while (frontier.length > 0 && variants.size < MAX_PHRASE_EQUIVALENT_VARIANTS) {
    const { value: current, depth } = frontier.pop()!;
    const lower = current.toLowerCase();

    for (const group of TITLE_PHRASE_EQUIVALENT_GROUPS) {
      for (const phrase of group) {
        const pattern = new RegExp(escapeRegExp(phrase), "gi");
        if (!pattern.test(lower)) continue;

        for (const alt of group) {
          if (alt.toLowerCase() === phrase.toLowerCase()) continue;
          const swapped = current.replace(pattern, (match) =>
            applyTokenCase(match, alt),
          );
          const key = swapped.toLowerCase();
          if (key === trimmed.toLowerCase() || seen.has(key)) continue;
          seen.add(key);
          variants.add(swapped);
          if (depth < 1) {
            frontier.push({ value: swapped, depth: depth + 1 });
          }
        }
      }
    }
  }

  return [...variants];
}

/** "Destiny The taken king" -> "Destiny: The Taken King" for provider indexes. */
function buildSubtitleColonVariants(title: string): string[] {
  if (title.includes(":")) return [];
  const match = title.match(/^(.+?)\s+((?:The|Le|La|Les)\s+.+)$/i);
  if (!match) return [];
  const colon = `${match[1].trim()}: ${match[2].trim()}`;
  if (colon.toLowerCase() === title.trim().toLowerCase()) return [];
  return [colon];
}

function buildLegendTitleVariants(title: string): string[] {
  const match = title.match(/^La\s+L[éeè]gende\s+(?:du|de|d')\s+(.+)$/i);
  if (!match) return [];

  const subject = match[1].trim();
  if (!subject) return [];

  return [subject, `Legend of ${subject}`, `The Legend of ${subject}`];
}

function buildApostropheTitleVariants(title: string): string[] {
  const variants = [
    title.replace(/\bde\s+([A-Za-zÀ-ÿ])/g, "d'$1"),
    title.replace(/\bdu\s+([A-Za-zÀ-ÿ])/gi, "d'$1"),
  ];
  return variants.filter((value) => value !== title);
}

/** Splits and normalizes common title separators without franchise-specific rules. */
function hasNumeralRangeSeparator(title: string): boolean {
  // Both sides must be explicit numerals — not "2 - L'avénement" where L starts
  // a French subtitle but happens to be a roman glyph.
  return (
    /\b\d+\s*[-–—]\s*\d+\b/.test(title) ||
    /\b[IVXLCDM]{2,}\s*[-–—]\s*(?:[IVXLCDM]{2,}|\d+)\b/i.test(title) ||
    /\b[IVXLCDM]\s*[-–—]\s*[IVXLCDM]\b/i.test(title)
  );
}

const EDITION_ONLY_FRAGMENT = createGameEditionMatcher("i");

/** Standalone edition/subtitle fragments too generic for provider search. */
export function isWeakMetadataSearchFragment(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!EDITION_ONLY_FRAGMENT.test(trimmed)) return false;

  const withoutEdition = trimmed
    .replace(EDITION_ONLY_FRAGMENT, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutEdition) return true;

  return withoutEdition.split(/\s+/).filter(Boolean).length <= 1;
}

export function buildSeparatorTitleVariants(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  const rangeSeparator = hasNumeralRangeSeparator(trimmed);

  const subtitleSplit = trimmed.match(/^([^:–—-]+?)\s*([:\-–—])\s*(.+)$/);
  if (subtitleSplit && !(rangeSeparator && /^[-–—]$/.test(subtitleSplit[2]))) {
    const leading = subtitleSplit[1].trim();
    const trailing = subtitleSplit[3].trim();
    if (!isWeakMetadataSearchFragment(leading)) variants.add(leading);
    if (!isWeakMetadataSearchFragment(trailing)) variants.add(trailing);
  }

  for (const value of [
    trimmed.replace(/\s*:\s*/g, " : "),
    trimmed.replace(/\s*:\s*/g, ": "),
    trimmed.replace(/\s+[-–—]\s+/g, " - "),
    trimmed.replace(/\s+[-–—]\s+/g, ": "),
    ...(rangeSeparator ? [] : [trimmed.replace(/\s*[:\-–—]\s*/g, " ")]),
  ]) {
    if (value !== trimmed) variants.add(value);
  }

  return [...variants];
}

function deDuplicateWordTailConsonants(title: string): string | null {
  const normalized = title.replace(/\s+/g, " ").trim();
  const rewritten = normalized
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/tt$/i, "t")
        .replace(/pp$/i, "p")
        .replace(/ff$/i, "f")
        .replace(/ck$/i, "k"),
    )
    .join(" ");
  if (rewritten === normalized) return null;
  return rewritten;
}

/** Common stylized spellings ("Pitt") -> indexed forms ("Pit"). */
export function buildStylizedSpellingVariants(title: string): string[] {
  const deduped = deDuplicateWordTailConsonants(title);
  return deduped ? [deduped] : [];
}

function splitCamelCaseWords(title: string): string | null {
  const split = title
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!split || !/\s/.test(split)) return null;
  if (split.toLowerCase() === title.trim().toLowerCase()) return null;
  return split;
}

/** Stylized fused titles ("BallXPitt") -> spaced forms providers actually index. */
export function buildCamelCaseTitleVariants(title: string): string[] {
  const trimmed = title.trim();
  if (
    !trimmed ||
    /\s/.test(trimmed) ||
    !/[a-z]/.test(trimmed) ||
    !/[A-Z]/.test(trimmed) ||
    trimmed.length < 4
  ) {
    return [];
  }

  const split = splitCamelCaseWords(trimmed);
  if (!split) return [];

  const variants = new Set<string>([split, split.replace(/\bX\b/g, "x")]);

  for (const spelling of buildStylizedSpellingVariants(split)) {
    variants.add(spelling);
    variants.add(spelling.replace(/\bX\b/g, "x"));
  }

  const withoutX = split
    .replace(/\s+[xX]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutX && withoutX.toLowerCase() !== split.toLowerCase()) {
    variants.add(withoutX);
    for (const spelling of buildStylizedSpellingVariants(withoutX)) {
      variants.add(spelling);
    }
  }

  return [...variants].filter(
    (value) => value.toLowerCase() !== trimmed.toLowerCase(),
  );
}

export function buildStructuralTitleSearchVariants(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (value: string) => {
    const candidate = value.replace(/\s+/g, " ").trim();
    if (!candidate || seen.has(candidate.toLowerCase())) return;
    if (isWeakMetadataSearchFragment(candidate)) return;
    seen.add(candidate.toLowerCase());
    ordered.push(candidate);
  };

  for (const value of [
    ...buildCamelCaseTitleVariants(trimmed),
    ...buildRomanRangeTitleVariants(trimmed),
    ...buildRomanNumeralTitleVariants(trimmed),
    ...buildTokenEquivalentTitleVariants(trimmed),
    ...buildPhraseEquivalentTitleVariants(trimmed),
    ...buildApostropheTitleVariants(trimmed),
    ...buildSeparatorTitleVariants(trimmed),
    ...buildLegendTitleVariants(trimmed),
  ]) {
    push(value);
    for (const colon of buildSubtitleColonVariants(value)) {
      push(colon);
    }
    for (const spelling of buildStylizedSpellingVariants(value)) {
      push(spelling);
    }
  }

  return ordered;
}
