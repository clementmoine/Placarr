import type { SealedKind } from "./kinds";

/**
 * Section title for guaranteed prints in the sealed detail dialog.
 * Deck bundles expand starters → « deck cards »; tins / duopacks with promos
 * stay « guarantees ».
 *
 * Client-safe — no registry / sharp. Do not move into `catalogueProducts.ts`.
 */
export function sealedGuaranteedPrintsSectionTitle(input: {
  fr: boolean;
  kind: SealedKind;
  hasGuaranteedProducts: boolean;
}): string {
  const deckExpanded =
    input.hasGuaranteedProducts &&
    (input.kind === "deck" || input.kind === "deck_bundle");
  if (deckExpanded) {
    return input.fr
      ? "Cartes des decks (décomposées)"
      : "Deck cards (expanded)";
  }
  return input.fr
    ? "Garanties (toujours dedans)"
    : "Guaranteed (always in)";
}
