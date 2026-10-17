/**
 * Catalogue TCG languages — targeted, not every locale on Earth.
 *
 * Policy (strict):
 * 1. **Original** — always ingest the product’s original language(s)
 * 2. **French** — mandatory when the source has it (never invent)
 * 3. **English** — when available
 *
 * Never invent translations. Absent upstream → absent in the catalogue.
 * DE / IT / ES / … only when they **are** the original (Ninja Ranks IT,
 * Lamincards IT, …).
 */
export function isCatalogueLang(
  lang: string | null | undefined,
  originalLangs: readonly string[],
): boolean {
  const code = (lang ?? "").trim().toLowerCase();
  if (!code) return false;
  if (originalLangs.some((o) => o.trim().toLowerCase() === code)) return true;
  if (code === "fr" || code === "en") return true;
  return false;
}

/**
 * Prefer originals, then French, then English (deduped).
 * Callers use this for face/title preference order.
 */
export function catalogueLangOrder(
  originalLangs: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...originalLangs, "fr", "en"]) {
    const code = raw.trim().toLowerCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Sealed / admin browse: keep SKUs whose lang is in the pack’s catalogue
 * contract. When `catalogueLocales` is unset, default originals to `ja` so
 * Carddass-style JA+FR+EN stays and DE/IT/ES drop (Lorcana sealed leak).
 */
export function isCatalogueProductLang(
  lang: string | null | undefined,
  catalogueLocales: readonly string[] | undefined,
): boolean {
  const code = (lang ?? "").trim().toLowerCase();
  if (!code) return false;
  const originals = catalogueLocales?.length
    ? catalogueLocales
    : (["ja"] as const);
  return isCatalogueLang(code, originals);
}
