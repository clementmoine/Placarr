/**
 * Map ygocards.fr / mtgcards.fr list tiles → local printKeys.
 *
 * Slug shapes differ from Bandai dbscards (`bt31-001-uc-…`):
 * - Magic: `tdm-fr-0001-m-ugin-…` → `mtg:tdm-1`
 * - YGO: `ra03001-sr-…` + CDN `/cards/fr/ra03/` → `yugioh:ra03-fr001`
 * - YGO: `agov-fr007-sr-…` → `yugioh:agov-fr007`
 */
import { mtgPrintKey } from "@/providers/mtg/printKey";
import { yugiohPrintKey } from "@/providers/yugioh/printKey";

const MTG_SLUG =
  /^([a-z0-9]+)-(?:fr|en|de|it|es|pt|ja|zhs|zht|ko|ru)-0*([0-9]+[a-z]*)-/i;

/** `tdm-fr-0001-m-…` → mtg:tdm-1 */
export function mtgcardsSlugToPrintKey(slug: string): string | null {
  const m = MTG_SLUG.exec(slug.trim());
  if (!m) return null;
  return mtgPrintKey(m[1]!, m[2]!);
}

/**
 * Prefer CDN folder `{lang}/{set}/` + digits after the set in the slug.
 * Fallback: `{set}-{lang}{num}` already hyphenated in the slug.
 */
export function ygocardsTileToPrintKey(tile: {
  slug: string;
  imageFront?: string | null;
  lang?: string | null;
}): string | null {
  const slug = tile.slug.trim().toLowerCase();

  const hyphen = /^([a-z0-9]+)-(fr|en|de|it|es|pt)(\d+[a-z]*)-/i.exec(slug);
  if (hyphen) {
    return yugiohPrintKey(hyphen[1]!, `${hyphen[2]}${hyphen[3]}`.toLowerCase());
  }

  const fromPath = /\/cards\/([a-z]{2})\/([a-z0-9]+)\//i.exec(
    tile.imageFront ?? "",
  );
  if (fromPath) {
    const pathLang = fromPath[1]!.toLowerCase();
    const set = fromPath[2]!.toLowerCase();
    if (slug.startsWith(set)) {
      const rest = slug.slice(set.length);
      const num = /^(\d+[a-z]*)-/i.exec(rest);
      if (num) {
        return yugiohPrintKey(set, `${pathLang}${num[1]!.toLowerCase()}`);
      }
    }
  }

  return null;
}
