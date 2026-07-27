/**
 * Variants of an object, per copy.
 *
 * A variant is the *same object printed or packaged differently*: a foil card,
 * a reverse holo, eventually a cartridge without its box. It is a property of
 * the copy you own, not of the catalogue entry — recording it on the metadata
 * would claim every copy is foil, and giving it its own metadata entry would
 * produce two records for one card and double every count, price and gallery.
 *
 * That is the line this module holds:
 *
 * - a different **model / edition / printing** is a different object → identity
 *   (`Metadata`, `Item.printKey`), chosen when the item is added;
 * - a different **finish** is the same object → `Item.variant`.
 *
 * The available options are asked of the provider that owns the print (see
 * `lookupPrintCandidate`), never persisted: what a print exists as belongs to
 * the provider, and a stored copy would drift as sets get corrected. Core only
 * carries the values — the vocabulary stays the provider's, `None`/`Silver` for
 * Lorcana, `reverse`/`holo` for Pokémon, `nonfoil`/`etched` for Magic.
 */

/** Fold to a comparable form so two spellings of one finish are one option. */
function key(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The offered options, in the order the provider declared them, deduplicated
 * case-insensitively and stripped of blanks.
 */
export function normalizeVariantOptions(
  options: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  if (!options?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const option of options) {
    const value = option?.trim();
    if (!value) continue;
    if (seen.has(key(value))) continue;
    seen.add(key(value));
    normalized.push(value);
  }
  return normalized;
}

/**
 * Whether a copy may carry a variant at all. One option is not a choice — a
 * card that only exists in foil says nothing about the copy, so the UI should
 * neither ask nor record it.
 */
export function offersVariantChoice(
  options: readonly (string | null | undefined)[] | null | undefined,
): boolean {
  return normalizeVariantOptions(options).length > 1;
}

/**
 * Keep a stored variant only while it is still offered, and answer with the
 * declared spelling. Returns `null` rather than guessing a replacement: quietly
 * relabelling someone's copy is worse than showing no variant at all.
 */
export function resolveStoredVariant(
  variant: string | null | undefined,
  options: readonly (string | null | undefined)[] | null | undefined,
): string | null {
  const stored = variant?.trim();
  if (!stored) return null;
  return (
    normalizeVariantOptions(options).find(
      (option) => key(option) === key(stored),
    ) ?? null
  );
}
