import { parsePrintKey } from "@/core/identify/printKey";

/**
 * The back of a card, which is a property of the game rather than of the card.
 *
 * One image per game — sometimes two across eras — so this is a handful of
 * files, not a data problem. No publisher ships it: Ravensburger's catalogue has
 * no `back` field anywhere, their own card viewer serves only logos, and it
 * never flips a card. The image is vendored instead.
 *
 * A game with no back simply gets no flip, rather than a flip onto a
 * placeholder that says nothing.
 *
 * **The Lorcana file is a placeholder.** It is 400x560, which is low next to
 * the 1468x2048 the card fronts come at, and it comes from a community mirror
 * rather than the publisher. It is here so the flip can be built and looked at;
 * it should be replaced by a Ravensburger or Lorcana original once one turns
 * up. Searched without success: the catalogue has no `back` field anywhere,
 * `card_sets[]` carries only a set thumbnail, their card viewer serves two
 * logos, and the marketing site never shows a card from behind.
 */
const CARD_BACKS: Readonly<Record<string, string>> = {
  lorcana: "/cardbacks/lorcana.webp",
};

/**
 * Where the back for this print lives, or `null`.
 *
 * Keyed off the print key's game segment, so it follows the same anchor as
 * everything else and needs no provider knowledge.
 */
export function cardBackUrlFor(
  printKey: string | null | undefined,
): string | null {
  const game = parsePrintKey(printKey)?.game;
  return (game && CARD_BACKS[game]) ?? null;
}
