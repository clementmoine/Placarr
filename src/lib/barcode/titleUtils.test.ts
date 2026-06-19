import { describe, expect, it } from "vitest";

import {
  areLikelySameProduct,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  isListingDiscardable,
  moveTrailingSortArticleToFront,
  versionProvider,
} from "@/lib/barcode/titleUtils";
import { isCanonicalProvider } from "@/services/providerEvidence";

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

  it("réaffiche les titres de tri avec l'article en tête", () => {
    expect(cleanTitleForDisplay("Dwarves, The")).toBe("The Dwarves");
    expect(cleanTitleForDisplay("Last Guardian, The")).toBe(
      "The Last Guardian",
    );
    expect(cleanTitleForDisplay("Hat in Time, A")).toBe("A Hat in Time");
  });

  it("nettoie les annonces escape game Unlock", () => {
    expect(
      cleanTitleForDisplay(
        "Jeu d'escape game Asmodee Unlock Short Adventures Red Mask",
      ),
    ).toBe("Unlock Short Adventures Red Mask");
    expect(
      cleanTitleForDisplay(
        "Asmodee Unlock Short Adventures Red Mask Space Cowboys Jeu D Enquete Escape Game",
      ),
    ).toBe("Unlock Short Adventures Red Mask");
  });
});

describe("moveTrailingSortArticleToFront", () => {
  it("détecte les articles anglais placés en fin de titre", () => {
    expect(moveTrailingSortArticleToFront("Dwarves, The")).toBe("The Dwarves");
    expect(moveTrailingSortArticleToFront("Adventure, An")).toBe(
      "An Adventure",
    );
  });

  it("laisse les titres normaux inchangés", () => {
    expect(moveTrailingSortArticleToFront("The Dwarves")).toBe("The Dwarves");
  });
});

describe("isListingDiscardable", () => {
  it("rejette une tagline de comparateur de prix", () => {
    expect(
      isListingDiscardable("Comparateur de prix neutre et indépendant"),
    ).toBe(true);
  });

  it("accepte un vrai titre produit", () => {
    expect(isListingDiscardable("Mario Kart Wii")).toBe(false);
  });
});

describe("areLikelySameProduct", () => {
  it("regroupe les variantes de casse et de bruit", () => {
    expect(areLikelySameProduct("Mario Kart Wii", "MARIO KART WII")).toBe(true);
  });

  it("sépare les produits différents", () => {
    expect(areLikelySameProduct("Tetris", "Final Fantasy VII")).toBe(false);
  });
});

describe("versionProvider / isCanonicalProvider", () => {
  it("versionne les providers de cache", () => {
    expect(versionProvider("ScreenScraper")).toBe(
      "ScreenScraper+canonical-v23",
    );
  });

  it("reconnaît les providers canoniques", () => {
    expect(isCanonicalProvider("ScreenScraper")).toBe(true);
    expect(isCanonicalProvider("eBay")).toBe(false);
  });
});

describe("filterPlatformRedundancies", () => {
  it("conserve au moins le premier titre", () => {
    const out = filterPlatformRedundancies(["Mario Kart Wii", "Mario Kart"]);
    expect(out[0]).toBe("Mario Kart Wii");
  });
});
