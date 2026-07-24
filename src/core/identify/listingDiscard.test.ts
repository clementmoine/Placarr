import { describe, expect, it } from "vitest";

import { isListingDiscardable } from "@/core/identify/listingDiscard";

describe("isListingDiscardable — reverse-meaning structural rules", () => {
  it.each([
    "Comparateur de prix neutre et indépendant",
    "Boîtier seul Zelda",
    "Zelda case only",
    "Notice seule Mario",
    "Empty box Halo",
    "Mario sans jeu",
    "Halo no game",
    "Notice et jaquette",
    "Zelda notice et jaquette",
    "Lot 3 jeux Wii",
    "Meilleurs prix du web",
  ])("discards %s", (title) => {
    expect(isListingDiscardable(title)).toBe(true);
  });

  it.each([
    "Mario Kart Wii",
    "The Legend of Zelda",
    "Naruto n°26",
    "Gottlieb Pinball Classics",
    "Mario Kart Wii Complet notice livret",
    "Halo 2 boite + notice complet",
  ])("keeps product title %s", (title) => {
    expect(isListingDiscardable(title)).toBe(false);
  });
});
