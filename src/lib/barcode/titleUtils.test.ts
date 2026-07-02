import { describe, expect, it } from "vitest";

import {
  areLikelySameProduct,
  barcodeListingMatchesItem,
  BARCODE_CACHE_VERSION,
  cleanTitleForDisplay,
  filterPlatformRedundancies,
  isListingDiscardable,
  isLotListing,
  moveTrailingSortArticleToFront,
  priceListingMatchesAnyItemName,
  priceListingVolumeConflictsWithItem,
  versionProvider,
} from "@/lib/barcode/titleUtils";
import { isCanonicalProvider } from "@/services/provider/evidence";

describe("cleanTitleForDisplay — bruit de listing → nom propre", () => {
  it("retire le préfixe de listing 'Jeu Vidéo'", () => {
    expect(
      cleanTitleForDisplay("Jeu Vidéo Mario Kart Wii", {
        preservePlatformSuffix: true,
      }).toLowerCase(),
    ).not.toContain("jeu vidéo");
  });

  it("retire le placeholder vendeur 'Inconnu' en préfixe (#3307216080831)", () => {
    expect(cleanTitleForDisplay("Inconnu Just Dance 2019")).toBe(
      "Just Dance 2019",
    );
  });

  it("retire un code région néerlandais 'FR/NL' en suffixe (#3307216080831)", () => {
    const out = cleanTitleForDisplay("JUST DANCE 2019 FR/NL");
    expect(out.toLowerCase()).not.toMatch(/\b(fr|nl)\b/);
    expect(out.toUpperCase()).toContain("JUST DANCE 2019");
  });

  it("retire les métadonnées entre parenthèses (PAL, édition…)", () => {
    const out = cleanTitleForDisplay("The Legend of Zelda (PAL FR)");
    expect(out.toLowerCase()).toContain("zelda");
    expect(out.toLowerCase()).not.toContain("pal");
  });

  it("retire emoji, format laserdisc, comptage de disques et guillemets", () => {
    const out = cleanTitleForDisplay(
      'Laserdisc📀  TOY STORY (PAL) 1 disque " WALT DISNEY "',
    );
    expect(out.toLowerCase()).toContain("toy story");
    expect(out).not.toMatch(/📀|"/);
    expect(out.toLowerCase()).not.toContain("laserdisc");
    expect(out.toLowerCase()).not.toContain("disque");
  });

  it("retire un préfixe 'vidéo PC' et les guillemets intégrés d'une annonce", () => {
    const out = cleanTitleForDisplay(
      'Jeu vidéo PC " Tom Clancy \'s Ghost Recon " - TBE',
    );
    expect(out.toLowerCase()).toContain("ghost recon");
    expect(out).not.toContain('"');
    expect(out.toLowerCase()).not.toContain("vidéo");
  });

  it("conserve le suffixe plateforme quand demandé, le retire sinon", () => {
    const kept = cleanTitleForDisplay("Super Mario Galaxy Wii", {
      preservePlatformSuffix: true,
    });
    expect(kept.toLowerCase()).toContain("wii");

    // Suffixe plateforme redondant → retiré sans preservePlatformSuffix.
    expect(cleanTitleForDisplay("Super Mario Galaxy Wii")).toBe(
      "Super Mario Galaxy",
    );
  });

  it("conserve les mots d'édition d'un titre canonique (preserveEditionTerms)", () => {
    // Un titre marketplace : « Classics » est du bruit → strippé.
    expect(cleanTitleForDisplay("Gottlieb Pinball Classics")).toBe(
      "Gottlieb Pinball",
    );
    // Un titre canonique (« Classics » fait partie du nom officiel) → gardé.
    expect(
      cleanTitleForDisplay("Gottlieb Pinball Classics", {
        preserveEditionTerms: true,
      }),
    ).toBe("Gottlieb Pinball Classics");
    expect(
      cleanTitleForDisplay("Super Paper Mario Nintendo Selects", {
        preserveEditionTerms: true,
      }),
    ).toBe("Super Paper Mario Nintendo Selects");
  });

  it("conserve un préfixe « Wii » intégral au titre officiel", () => {
    // "Wii Sports/Play/Fit…" : "Wii" fait partie du nom (sinon "Sports" seul est
    // faux). Jamais strippé.
    expect(cleanTitleForDisplay("Wii Play")).toBe("Wii Play");
    expect(cleanTitleForDisplay("Wii Sports")).toBe("Wii Sports");
    expect(cleanTitleForDisplay("Wii Sports Resort")).toBe("Wii Sports Resort");
    expect(cleanTitleForDisplay("Wii Fit")).toBe("Wii Fit");
    // …mais un préfixe « Wii » NON intégral (autre jeu) reste retiré.
    expect(cleanTitleForDisplay("Wii Mario Kart")).toBe("Mario Kart");
    expect(cleanTitleForDisplay("Nintendo Wii Zelda")).toBe("Zelda");
  });

  it("retire un préfixe plateforme en tête de titre marketplace", () => {
    expect(cleanTitleForDisplay("Atari 2600 Ryse : Son of Rome")).toBe(
      "Ryse : Son of Rome",
    );
    expect(cleanTitleForDisplay("Xbox One Halo 3")).toBe("Halo 3");
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

describe("barcodeListingMatchesItem", () => {
  it("rejects a different numbered volume from another collection", () => {
    expect(
      barcodeListingMatchesItem(
        "Super Picsou Géant n°10",
        "La Grande Histoire de Picsou Tome 01",
      ),
    ).toBe(false);
  });

  it("accepts listings aligned with the same issue", () => {
    expect(
      barcodeListingMatchesItem(
        "Super Picsou Géant n°10",
        "Super Picsou Géant n°10",
      ),
    ).toBe(true);
  });
});

describe("priceListingVolumeConflictsWithItem", () => {
  it("flags a different issue number on the same series", () => {
    expect(
      priceListingVolumeConflictsWithItem(
        ["Super Picsou Géant n°07"],
        "Super Picsou Géant n°183 occasion",
      ),
    ).toBe(true);
  });

  it("ignores unrelated listings without explicit volumes", () => {
    expect(
      priceListingVolumeConflictsWithItem(
        ["L'Art et la Création de Arcane"],
        "Graphics Tablet Pen Display 2 Monitor",
      ),
    ).toBe(false);
  });
});

describe("barcodeListingMatchesItem volume markers", () => {
  it("aligns equivalent volume markers across formats", () => {
    expect(
      barcodeListingMatchesItem(
        "Death Note Tome 01",
        "Death Note Vol. 1",
      ),
    ).toBe(true);
  });

  it("accepts cross-language art-book titles sharing a franchise token", () => {
    expect(
      barcodeListingMatchesItem(
        "L'Art et la Création de Arcane",
        "The Art and Making of Arcane League Of Legends",
      ),
    ).toBe(true);
  });

  it("rejects unrelated marketplace noise on the same barcode", () => {
    expect(
      barcodeListingMatchesItem(
        "L'Art et la Création de Arcane",
        "Graphics Tablet Pen Display 2 Monitor 2K IPS",
      ),
    ).toBe(false);
  });

  it("rejects a numbered anthology volume when the item names another episode", () => {
    expect(
      barcodeListingMatchesItem(
        "Dark Pictures: The Devil in Me",
        "the dark pictures anthology volume 1 - PS4 - neuf",
      ),
    ).toBe(false);
  });
});

describe("priceListingMatchesAnyItemName", () => {
  it("aligns FR and EN celebration edition subtitles", () => {
    expect(
      priceListingMatchesAnyItemName(
        ["Rise of the Tomb Raider - 20eme Anniversaire"],
        "Rise of the Tomb Raider: 20 Year Celebration Edition - PS4",
      ),
    ).toBe(true);
    expect(
      priceListingMatchesAnyItemName(
        ["Rise of the Tomb Raider - 20eme Anniversaire"],
        "Rise of the Tomb Raider - Célébration des 20 ans",
      ),
    ).toBe(true);
  });

  it("rejects anthology volume listings when the item names another episode", () => {
    expect(
      priceListingMatchesAnyItemName(
        ["Dark Pictures: The Devil in Me"],
        "the dark pictures anthology volume 1 - PS4 - neuf",
      ),
    ).toBe(false);
  });

  it("rejects unrelated short-title homonyms and component listings", () => {
    expect(
      priceListingMatchesAnyItemName(["Transistor"], "Transistor BD139"),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(
        ["Transistor"],
        "Helly Hansen Transistor 30L",
      ),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(["Transistor"], "Transistor sur PS4"),
    ).toBe(true);
  });

  it("rejects a higher edition tier than the item names", () => {
    expect(
      priceListingMatchesAnyItemName(
        ["Borderlands 3 - Edition Deluxe"],
        "Borderlands 3 : Edition Super Deluxe",
      ),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(
        ["Borderlands 3 - Edition Deluxe"],
        "Borderlands 3 Deluxe Edition sur PS4",
      ),
    ).toBe(true);
  });

  it("rejects manga lots, booster boxes, and homonym tome listings", () => {
    expect(
      priceListingMatchesAnyItemName(
        ["Alice 19 n°01"],
        "5 MANGA Alice 19 N°1-2-3-4-5",
      ),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(
        ["Blazer Drive n°01"],
        "Tomes 1 à 9 Blazer Drive",
      ),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(
        ["The Promised Neverland n°01"],
        "The Promised Neverland Box Set Vol. 1-20",
      ),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(
        ["Dragon Ball Super n°01"],
        "Dragon Ball Super Mythic Booster Box",
      ),
    ).toBe(false);
    expect(
      priceListingMatchesAnyItemName(
        ["Blazer Drive n°01"],
        "The Bittersweet Symphony Duet Tome 1 Drive (Grand format)",
      ),
    ).toBe(false);
  });
});

describe("versionProvider / isCanonicalProvider", () => {
  it("versionne les providers de cache", () => {
    expect(versionProvider("ScreenScraper")).toBe(
      `ScreenScraper+${BARCODE_CACHE_VERSION}`,
    );
  });

  it("reconnaît les providers canoniques", () => {
    expect(isCanonicalProvider("ScreenScraper")).toBe(true);
    expect(isCanonicalProvider("eBay")).toBe(false);
  });
});

describe("isLotListing — détection des lots multi-jeux", () => {
  it("repère les lots explicites et les suites en série", () => {
    for (const name of [
      "Teenage Mutant Ninja Turtles 1,2,3 NES",
      "Resident Evil 1, 2, 3 GameCube",
      "Spyro 1 2 3 PS1",
      "Lot de 3 jeux Nintendo Wii",
      "Lot of games PS2",
      "Bundle 5 games Xbox",
      "Pack 4 jeux PSP",
    ]) {
      expect(isLotListing(name)).toBe(true);
    }
  });

  it("repère les lots manga multi-tomes", () => {
    for (const name of [
      "5 MANGA Alice 19 N°1-2-3-4-5",
      "Tomes 1 à 9 Blazer Drive",
      "The Promised Neverland Box Set Vol. 1-20",
      "Lot 3 tomes One Piece",
    ]) {
      expect(isLotListing(name)).toBe(true);
    }
  });

  it("ne déclasse pas les jeux uniques (suites, collections officielles, faux positifs)", () => {
    for (const name of [
      "Tom Clancy's Ghost Recon",
      "Resident Evil 2 game",
      "Tony Hawk's Pro Skater 1 + 2",
      "1-2-Switch",
      "Crash Bandicoot N. Sane Trilogy",
      "Teenage Mutant Ninja Turtles II: The Arcade Game",
      "Ensemble Stars",
      "Coffret Collector Zelda",
      "1080 Snowboarding",
      "Final Fantasy VII",
    ]) {
      expect(isLotListing(name)).toBe(false);
    }
  });
});

describe("filterPlatformRedundancies", () => {
  it("conserve au moins le premier titre", () => {
    const out = filterPlatformRedundancies(["Mario Kart Wii", "Mario Kart"]);
    expect(out[0]).toBe("Mario Kart Wii");
  });
});
