/**
 * pkmcards.fr Pokémon slugs — `pbl-fr-001-mega-evolution-nuit-noire-tropius`.
 *
 * Unlike DBS (`bt31-001-uc-…` / `en-bt25-009-…`), the locale sits between set
 * abbr and collector number. `dbscardsPrintRef` therefore yields null here.
 */

const LOCALE =
  "fr|en|de|it|es|pt|ja|jp|ptbr|pt-br" as const;

const SLUG_RE = new RegExp(
  `^([a-z0-9]+)-(${LOCALE})-(\\d+[a-z]*)-`,
  "i",
);

export type PkmcardsPokemonSlug = {
  /** Official abbr as on the CDN (`pbl`, `dri`). */
  setAbbr: string;
  /** Folder lang (`jp` → `ja`). */
  lang: string;
  /** Printed number without set (`001`). */
  number: string;
};

export function parsePkmcardsPokemonSlug(
  slug: string,
): PkmcardsPokemonSlug | null {
  const match = SLUG_RE.exec(slug.trim());
  if (!match) return null;
  const rawLang = match[2]!.toLowerCase();
  const lang =
    rawLang === "jp" ? "ja" : rawLang === "pt-br" ? "ptbr" : rawLang;
  return {
    setAbbr: match[1]!.toLowerCase(),
    lang,
    number: match[3]!.toLowerCase(),
  };
}
