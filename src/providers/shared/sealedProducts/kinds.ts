/**
 * Sealed SKU kinds the catalogue shows — the objects decided in
 * collection_checklist.md, not the host's nav slugs.
 *
 * A judge pack is still a booster (other name, other visuel). A Trove is a
 * coffret. Puzzles are not a card SKU.
 *
 * `ephemera` is the odd one out and stays deliberately narrow: printed matter
 * an editor put out beside the cards — dealer sell sheet, poster, order form.
 * It holds **no cards at all**, which is why it gets its own behaviour instead
 * of being filed as a coffret: a coffret that opens on nothing would read as a
 * bundle whose contents we failed to list.
 */
import { tcgCardsCategoryRole } from "@/providers/shared/dbscards/sites";

export type SealedKind =
  "booster" | "display" | "deck" | "coffret" | "ephemera";

export type SealedBehavior =
  | "random_pack"
  | "pack_container"
  | "known_bundle"
  | "mixed_bundle"
  | "no_cards";

export function sealedKindForCategory(category: string): SealedKind | null {
  if (tcgCardsCategoryRole(category) === "skip") return null;
  if (category === "puzzles") return null;
  if (category === "displays") return "display";
  if (category === "boosters" || category === "boosters-blister") {
    return "booster";
  }
  if (category === "decks" || category.endsWith("-decks")) return "deck";
  return "coffret";
}

export function sealedBehaviorForKind(kind: SealedKind): SealedBehavior {
  switch (kind) {
    case "booster":
      return "random_pack";
    case "display":
      return "pack_container";
    case "deck":
      return "known_bundle";
    case "coffret":
      return "mixed_bundle";
    case "ephemera":
      return "no_cards";
  }
}

/**
 * A booster / display is never "I know these cards", and a sell sheet has
 * none to know. A deck or exclusive box is known when the fiche is not a
 * labelled preview and lists prints.
 */
export function sealedContentsKnown(input: {
  kind: SealedKind;
  containsPrintsIsPreview: boolean;
  printCount: number;
}): boolean {
  if (
    input.kind === "booster" ||
    input.kind === "display" ||
    input.kind === "ephemera"
  ) {
    return false;
  }
  return !input.containsPrintsIsPreview && input.printCount > 0;
}
