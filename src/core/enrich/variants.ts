/**
 * Variants of an object, per copy.
 *
 * A variant is the *same object printed or packaged differently*: a foil card,
 * a reverse holo, eventually a cartridge without its box. It is a property of
 * the copy you own, not of the catalogue entry — recording it on the metadata
 * would claim every copy is foil, and splitting it into its own metadata entry
 * would give two records for one card and double every count, price and
 * gallery.
 *
 * That is the line this module holds:
 *
 * - a different **model / edition / printing** is a different object → identity
 *   (`Metadata`, `Item.printKey`), chosen when the item is added;
 * - a different **finish** is the same object → `Item.variant`.
 *
 * Providers publish the options as facts rather than through a typed field, so
 * the vocabulary stays theirs: `None`/`Silver` for Lorcana, `reverse`/`holo`
 * for Pokémon, `nonfoil`/`etched` for Magic. Core never interprets the values,
 * it only carries them.
 */

/**
 * Fact kind carrying one available variant. Read structurally — never by label,
 * which is localized and provider-owned. Absent from every display allow-list,
 * so these facts stay out of the fiche.
 */
export const VARIANT_OPTION_FACT_KIND = "variant-option";

type FactLike = { kind?: string | null; value?: string | null };

/**
 * The variants this object exists in, in the order providers declared them.
 * Deduplicated case-insensitively: two providers describing the same finish
 * should offer one choice, not two.
 */
export function variantOptionsFromFacts(
  facts: readonly FactLike[] | null | undefined,
): string[] {
  if (!facts?.length) return [];

  const seen = new Set<string>();
  const options: string[] = [];
  for (const fact of facts) {
    if (fact?.kind !== VARIANT_OPTION_FACT_KIND) continue;
    const value = fact.value?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(value);
  }
  return options;
}

/**
 * Whether a copy may carry a variant at all. One option is not a choice — a
 * card that only exists in foil says nothing about the copy, so the UI should
 * not ask.
 */
export function offersVariantChoice(
  facts: readonly FactLike[] | null | undefined,
): boolean {
  return variantOptionsFromFacts(facts).length > 1;
}

/**
 * Keep a stored variant only while the metadata still declares it. A provider
 * dropping an option must not leave copies claiming a variant that no longer
 * exists, and an unrecognized value must not be silently rewritten either — so
 * this returns `null` rather than guessing a replacement.
 */
export function resolveStoredVariant(
  variant: string | null | undefined,
  facts: readonly FactLike[] | null | undefined,
): string | null {
  const stored = variant?.trim();
  if (!stored) return null;
  const match = variantOptionsFromFacts(facts).find(
    (option) => option.toLowerCase() === stored.toLowerCase(),
  );
  return match ?? null;
}
