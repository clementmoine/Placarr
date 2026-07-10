/**
 * PriceCharting keeps apostrophes in its title slugs, URL-encoded:
 * "Assassin's Creed III" -> `assassin%27s-creed-iii` (the generic route
 * slugify would produce `assassin-s-creed-iii`, which 404s).
 *
 * Apostrophes ride through the hyphenation pass untouched (they are part
 * of the keep-set), then get percent-encoded last.
 */
export function priceChartingTitleSlug(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9'’]+/g, "-")
    .replace(/^[-'’]+|[-'’]+$/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/['’]+/g, "%27");
}

/** Bundle listings often keep a literal ampersand in the slug (`halo-reach-&-fable-3`). */
export function priceChartingAmpersandTitleSlug(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9'’&]+/g, "-")
    .replace(/^[-'’&]+|[-'’&]+$/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/['’]+/g, "%27");
}
