import { describe, it, expect, vi } from "vitest";

// Ces fonctions sont pures, mais importer le module instancie PrismaClient
// (via @/lib/prisma) : on le neutralise pour garder le test léger et isolé.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  cleanTitleForDisplay,
  areLikelySameProduct,
  isListingDiscardable,
  versionProvider,
  isCanonicalProvider,
  filterPlatformRedundancies,
} from "./barcodeResolver";

describe("cleanTitleForDisplay — bruit de listing → nom propre", () => {
  it("retire le préfixe de listing 'Jeu Vidéo'", () => {
    expect(
      cleanTitleForDisplay("Jeu Vidéo Mario Kart Wii", {
        preservePlatformSuffix: true,
      }).toLowerCase(),
    ).not.toContain("jeu vidéo");
  });

  it("retire les métadonnées entre parenthèses (PAL, édition…)", () => {
    const out = cleanTitleForDisplay("The Legend of Zelda (PAL FR)");
    expect(out.toLowerCase()).toContain("zelda");
    expect(out.toLowerCase()).not.toContain("pal");
  });

  it("conserve le suffixe plateforme quand demandé, le retire sinon", () => {
    const kept = cleanTitleForDisplay("Mario Kart Wii", {
      preservePlatformSuffix: true,
    });
    expect(kept.toLowerCase()).toContain("wii");

    const stripped = cleanTitleForDisplay("Mario Kart Wii", {
      preservePlatformSuffix: false,
    });
    expect(stripped.toLowerCase()).toContain("mario kart");
  });

  it("gère les entrées vides sans planter", () => {
    expect(cleanTitleForDisplay("")).toBe("");
  });
});

describe("areLikelySameProduct — ne jamais confondre deux produits différents", () => {
  it("identifie le même produit (casse/variante)", () => {
    expect(areLikelySameProduct("Mario Kart Wii", "MARIO KART WII")).toBe(true);
    expect(
      areLikelySameProduct(
        "The Legend of Zelda: Twilight Princess",
        "Zelda Twilight Princess",
      ),
    ).toBe(true);
  });

  it("distingue deux jeux totalement différents", () => {
    expect(areLikelySameProduct("Tetris", "Final Fantasy VII")).toBe(false);
    expect(areLikelySameProduct("Mario Kart Wii", "Mario Party 8")).toBe(false);
  });

  it("ne fusionne pas une suite avec l'opus précédent", () => {
    expect(
      areLikelySameProduct("Super Mario Galaxy", "Super Mario Galaxy 2"),
    ).toBe(false);
  });
});

describe("isListingDiscardable", () => {
  it("ne jette pas un titre propre", () => {
    expect(isListingDiscardable("Mario Kart Wii")).toBe(false);
  });
});

describe("versionProvider / isCanonicalProvider", () => {
  it("versionne le provider et reste idempotent", () => {
    expect(versionProvider("ScreenScraper")).toBe("ScreenScraper+canonical-v23");
    expect(versionProvider("ScreenScraper+canonical-v23")).toBe(
      "ScreenScraper+canonical-v23",
    );
  });

  it("reconnaît les providers canoniques (fiables)", () => {
    expect(isCanonicalProvider("ScreenScraper")).toBe(true);
    expect(isCanonicalProvider("IGDB")).toBe(true);
    expect(isCanonicalProvider("eBay")).toBe(false);
  });
});

describe("filterPlatformRedundancies", () => {
  it("supprime la variante redondante 'titre + plateforme'", () => {
    const out = filterPlatformRedundancies(["Mario Kart", "Mario Kart Wii"]);
    expect(out).toContain("Mario Kart");
    expect(out).not.toContain("Mario Kart Wii");
  });

  it("conserve la première suggestion telle quelle", () => {
    const out = filterPlatformRedundancies(["Mario Kart Wii", "Autre chose"]);
    expect(out[0]).toBe("Mario Kart Wii");
  });
});
