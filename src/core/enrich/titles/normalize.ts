/**
 * Shared diacritic-stripped lowercase form for title tokenization.
 * Leaf under enrich/titles so identify + enrich can share without cycles
 * (displayScore must not import identify/titleUtils).
 */
export function normalizeForTokens(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accent marks
    .toLowerCase();
}

/** Substring match ignoring case and accents (« epees » ⊂ « 7 Épées »). */
export function includesFolded(haystack: string, needle: string): boolean {
  const n = normalizeForTokens(needle);
  if (!n) return true;
  return normalizeForTokens(haystack).includes(n);
}

/**
 * Some catalogs (notably ScreenScraper FR noms) store subtitle separators as
 * "Main ? Subtitle" because `:` is awkward in filenames. Real interrogative
 * titles keep a trailing `?` — leave those alone.
 */
export function repairCatalogColonSubstitute(title: string): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (!trimmed) return title;
  if ((trimmed.match(/\?/g) || []).length !== 1) return title;
  if (/\?\s*$/.test(trimmed)) return title;
  if (!/\s\?\s/.test(trimmed)) return title;
  return trimmed.replace(/\s\?\s/, " : ");
}
