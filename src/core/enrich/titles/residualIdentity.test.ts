import { describe, expect, it } from "vitest";
import {
  residualIdentityMatch,
  authorNamesFromMetadata,
  hardwareProductTitlesAlign,
  identityTokens,
} from "@/core/enrich/titles/residualIdentity";
import { isMetadataTitleAligned } from "@/core/enrich/titleMatching";

describe("identityTokens", () => {
  it("conserve les tokens courts (z) — pas de liste spin-off", () => {
    expect(identityTokens("Dragon Ball Z - Tome 2")).toEqual([
      "dragon",
      "ball",
      "z",
    ]);
    expect(identityTokens("Dragon Ball, tome 2")).toEqual(["dragon", "ball"]);
    expect(identityTokens("Baldur's Gate 3")).toEqual(["baldurs", "gate", "3"]);
  });

  it("retire plateforme registry + connecteurs, pas l'identité produit", () => {
    expect(identityTokens("Silt sur PS4")).toEqual(["silt"]);
    expect(identityTokens("Garou: Mark of the Wolves sur NEOGEO AES+")).toEqual(
      ["garou", "mark", "of", "the", "wolves"],
    );
    expect(identityTokens("Far Cry Blood Dragon")).toEqual([
      "far",
      "cry",
      "blood",
      "dragon",
    ]);
  });
});

describe("residualIdentityMatch", () => {
  it("rejette Dragon Ball Z vs classique (ligne de série ordonnée, pas une liste)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Dragon Ball Z - Tome 2"],
      candidateTitles: ["Dragon Ball, tome 2"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("request_series_line_unexplained");
  });

  it("rejette Super vs super livre (ligne étendue, pas une liste)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Dragon Ball Super n°01"],
      candidateTitles: ["Dragon Ball - Le super livre, Tome 1"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("series_line_extended_on_candidate");
  });

  it("conserve Cycle sur Dragon Ball Z (pas une extension de ligne)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Dragon Ball Z - Tome 2"],
        candidateTitles: ["Dragon Ball Z - Cycle 1, tome 2"],
      }).decision,
    ).toBe("uncertain");
  });

  it("accepte même volume + résidu vide (Naruto)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Naruto n°26"],
        candidateTitles: ["Naruto - Tome 26"],
      }).decision,
    ).toBe("accept");
  });

  it("accepte un résidu couvert par authors", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Naruto n°26"],
      candidateTitles: ["Naruto - Tome 26 - Masashi Kishimoto"],
      candidateAuthors: ["Masashi Kishimoto"],
    });
    expect(result.decision).toBe("accept");
    expect(result.reasons).toContain("author_covered");
  });

  it("rejette un conflit de volume", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Naruto n°26"],
        candidateTitles: ["Naruto - Tome 27"],
      }).decision,
    ).toBe("reject");
  });

  it("rejette un volume manquant côté candidat", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Super Picsou Géant n°01"],
        candidateTitles: ["Super Picsou Geant"],
      }).reasons,
    ).toContain("volume_missing_on_candidate");
  });

  it("rejette un tome arbitraire sur une demande collection seule", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Fullmetal Alchemist"],
        candidateTitles: ["Fullmetal Alchemist - Tome 17"],
      }).reasons,
    ).toContain("unrequested_volume_on_candidate");
  });

  it("rejette le merch / coque", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Naruto n°26"],
        candidateTitles: ["Coque Naruto n°26"],
      }).reasons,
    ).toContain("merch_accessory");
  });

  it("rejette une identité candidat inexpliquée sans volume partagé", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Far Cry"],
      candidateTitles: ["Far Cry Blood Dragon"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("unexplained_candidate_identity");
  });

  it("reste uncertain FR↔EN (résidu bilatéral)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["La Révélation Finale"],
      candidateTitles: ["The Last Revelation"],
    });
    expect(result.decision).toBe("uncertain");
    expect(result.reasons).toContain("bilateral_unexplained");
  });

  it("sous-titre album avec volume matché → uncertain (pas reject)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Dragon Ball n°01"],
      candidateTitles: ["Dragon Ball 1 . Le nuage supersonique"],
    });
    expect(result.decision).toBe("uncertain");
    expect(result.reasons).toContain("ambiguous_residual_with_volume");
  });

  it("cross-lang bilatéral → uncertain (pas reject sibling)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Ni No Kuni 2 - L'avénement d'un nouveau royaume"],
        candidateTitles: ["Ni no Kuni II: Revenant Kingdom"],
      }).decision,
    ).toBe("uncertain");
  });
});

describe("isMetadataTitleAligned via residual", () => {
  it("aligne AbeBooks-like avec authors", () => {
    expect(
      isMetadataTitleAligned(
        {
          title: "Naruto - Tome 26 - Masashi Kishimoto",
          authors: [{ name: "Masashi Kishimoto" }],
        },
        ["Naruto n°26"],
        0.58,
      ),
    ).toBe(true);
  });

  it("rejette DB classique pour demande Z via résidu", () => {
    expect(
      isMetadataTitleAligned(
        { title: "Dragon Ball, tome 2" },
        ["Dragon Ball Z - Tome 2"],
        0.58,
      ),
    ).toBe(false);
  });

  it("authorNamesFromMetadata extrait les noms", () => {
    expect(
      authorNamesFromMetadata([{ name: "Masashi Kishimoto" }, { name: "" }]),
    ).toEqual(["Masashi Kishimoto"]);
  });

  it("accepte la restatement arabe d'un sequel romain déjà présent", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Alan Wake II - Deluxe Edition"],
        candidateTitles: ["PS5 Alan Wake II (2) Deluxe Edition"],
      }).decision,
    ).toBe("accept");
  });

  it("ignore japanese / artbook comme packaging listing, pas identité", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Lollipop Chainsaw RePOP"],
        candidateTitles: ["PS5 Lollipop Chainsaw RePOP Japanese"],
      }).decision,
    ).toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["L'Art et la Création de Arcane"],
        candidateTitles: ["Artbook L'art et la création de Arcane"],
      }).decision,
    ).toBe("accept");
  });

  it("ne laisse pas un fragment d'alignement vetoer le titre complet", () => {
    expect(
      residualIdentityMatch({
        requestTitles: [
          "Assassin's Creed Valhalla l'Aube du Ragnarok",
          "Assassin's Creed",
          "l'Aube du Ragnarok",
        ],
        candidateTitles: [
          "Assassin's Creed Valhalla DLC Aube du Ragnarok sur PS4",
        ],
      }).decision,
    ).not.toBe("reject");
  });

  it("ne laisse pas une variante romaine vetoer le titre primaire", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Death Note Tome 1", "Death Note I", "Death Note"],
        candidateTitles: ["Death Note - Tome 1"],
      }).decision,
    ).toBe("accept");
  });

  it("rejects Sony Slim Rose vs bare Slim (brand prefix must not hide color line)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Sony Playstation 2 Slim Rose"],
      candidateTitles: ["Playstation 2 Slim"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("request_series_line_unexplained");
  });

  it("rejects Rose vs Pink without inventing a FR↔EN alias", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Sony Playstation 2 Slim Rose"],
      candidateTitles: ["Playstation 2 Slim Pink"],
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("series_suffix_mismatch");
  });

  it("accepts hyphenated compound vs catalog join (Q-Force ≡ QForce)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Ratchet and Clank: Q-Force"],
        candidateTitles: ["Ratchet & Clank: QForce"],
      }).decision,
    ).toBe("accept");
  });
});

describe("residualIdentityMatch hardware", () => {
  it("accepte OLED Model comme chrome catalog (pas identité)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch OLED"],
        candidateTitles: ["Nintendo Switch OLED Model"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte Modèle (FR) comme chrome catalog", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch OLED Édition The Legend of Zelda"],
        candidateTitles: [
          "Console Nintendo Switch Modèle OLED Édition The Legend of Zelda",
        ],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette une édition Pokémon OLED pour une édition Zelda", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Nintendo Switch OLED Édition The Legend of Zelda"],
      candidateTitles: [
        "Console Nintendo Switch Modèle OLED Edition Pokémon Ecarlate & Pokémon Violet",
      ],
      shelfType: "hardware",
    });
    expect(result.decision).not.toBe("accept");
    expect(result.reasons).toContain("bilateral_unexplained");
  });

  it("accepte une édition console → SKU OLED générique", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch OLED Édition The Legend of Zelda"],
        candidateTitles: ["Nintendo Switch OLED Model"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette un jeu Zelda NES pour une Switch OLED", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Nintendo Switch OLED Édition The Legend of Zelda"],
      candidateTitles: ["The Legend of Zelda"],
      shelfType: "hardware",
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("candidate_missing_hardware_identity");
  });

  it("accepte Sony + PlayStation 5 (préfixe marque)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Sony Playstation 5"],
        candidateTitles: ["PlayStation 5"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette PS One pour une PS5 (génération / plateforme distincte)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["PlayStation 5"],
      candidateTitles: ["PS One"],
      shelfType: "hardware",
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("platform_key_mismatch");
  });

  it("rejette PS One pour une PlayStation Classic (ligne produit inexpliquée)", () => {
    const result = residualIdentityMatch({
      requestTitles: ["PlayStation Classic Console"],
      candidateTitles: ["PS One"],
      shelfType: "hardware",
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("candidate_missing_hardware_identity");
  });

  it("accepte DualSense même si le catalog omet PS5", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Manette DualSense PS5"],
        candidateTitles: ["DualSense Wireless Controller"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette toujours Slim Rose → Slim (SKU couleur)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Sony Playstation 2 Slim Rose"],
        candidateTitles: ["Playstation 2 Slim"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("accepte PS4 Pro ↔ Sony PlayStation 4 Pro 1TB Console Black", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 4 PS4 Pro"],
        candidateTitles: ["Sony PlayStation 4 Pro 1TB Console Black"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte (PS4) comme abréviation déjà couverte par PlayStation + 4", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 4 Pro"],
        candidateTitles: ["Sony PlayStation 4 (PS4) Pro 1To"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette un jeu Switch Sports pour la console Switch", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch"],
        candidateTitles: ["Nintendo Switch Sports"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("ne valide pas Nintendogs / DSi pour la console Nintendo DS", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo DS"],
        candidateTitles: [
          "Nintendogs + cats Caniche Toy & ses nouveaux amis Nintendo 3DS",
        ],
        shelfType: "hardware",
      }).decision,
    ).not.toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo DS"],
        candidateTitles: ["Nintendo DSi - Noir"],
        shelfType: "hardware",
      }).decision,
    ).not.toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo DS"],
        candidateTitles: ["Black Nintendo DS System"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette Switch 2 / Mini NES / Classic pour la console d'origine", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch"],
        candidateTitles: ["Nintendo Switch 2"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo NES"],
        candidateTitles: ["Nintendo Classic Mini NES 2016 512Mo"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation"],
        candidateTitles: ["Sony PlayStation Classic"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("rejette PS5 pour une PlayStation fat bare", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation"],
        candidateTitles: ["Sony PlayStation 5 Slim Digital Edition"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("accepte NES Deluxe Set comme chrome catalog (set)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo NES"],
        candidateTitles: ["Nintendo NES Deluxe Set Console"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette une manette GameCube pour la console GameCube Black", () => {
    const result = residualIdentityMatch({
      requestTitles: ["Nintendo GameCube Black"],
      candidateTitles: ["GameCube Controller Black"],
      shelfType: "hardware",
    });
    expect(result.decision).toBe("reject");
    expect(result.reasons).toContain("controller_accessory");
  });

  it("accepte une console NES vendue avec manette (bundle Back Market)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo NES"],
        candidateTitles: ["Nintendo NES - Manette Gris"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch"],
        candidateTitles: ["Nintendo Switch with Gray Joy-Con"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte Black Gamecube System sans préfixe Nintendo (chrome marque)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo GameCube Black"],
        candidateTitles: ["Black Gamecube System"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte Switch Joycon Gris ↔ console with Gray Joy-Con, rejette Joy-Con pad seul", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Switch Joycon Gris"],
        candidateTitles: ["Nintendo Switch with Gray Joy-Con"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");

    const padOnly = residualIdentityMatch({
      requestTitles: ["Nintendo Switch Joycon Gris"],
      candidateTitles: ["Joy-Con Gray"],
      shelfType: "hardware",
    });
    expect(padOnly.decision).toBe("reject");
    expect(padOnly.reasons).toContain("controller_accessory");
  });

  it("accepte PS5 bare → Console Disc Version (disc = chrome), rejette Digital", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 5"],
        candidateTitles: ["PlayStation 5 Console Disc Version"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 5"],
        candidateTitles: ["PlayStation 5 Digital Edition"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("rejette une capacité console différente (60Go ↛ 80GB), accepte Go≡GB", () => {
    const mismatch = residualIdentityMatch({
      requestTitles: ["PlayStation 3 60Go"],
      candidateTitles: ["PlayStation 3 80GB Console"],
      shelfType: "hardware",
    });
    expect(mismatch.decision).toBe("reject");
    expect(mismatch.reasons).toContain("storage_capacity_conflict");

    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 3 60Go"],
        candidateTitles: ["PlayStation 3 60GB Console"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");

    // Candidate-only capacity stays chrome (bare Pro ↔ 1TB).
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 4 Pro"],
        candidateTitles: ["PlayStation 4 Pro 1TB Console"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte PSOne ↔ PSOne Slim System (redesign), rejette Vita bare ↔ Slim", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PSOne"],
        candidateTitles: ["PSOne Slim System"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation Vita"],
        candidateTitles: ["PlayStation Vita Slim"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("rejette Slim vs Super Slim et accepte 500GB Super Slim réordonné", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["Playstation 3 Super Slim 500GB"],
        candidateTitles: ["Playstation 3 Slim 500GB"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
    expect(
      residualIdentityMatch({
        requestTitles: ["Playstation 3 Super Slim 500GB"],
        candidateTitles: ["Playstation 3 500GB Super Slim"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("rejette Blanche ↛ Black, accepte Blanche ≡ White", () => {
    const mismatch = residualIdentityMatch({
      requestTitles: ["Nintendo Wii Blanche"],
      candidateTitles: ["Wii Console Black"],
      shelfType: "hardware",
    });
    expect(mismatch.decision).toBe("reject");
    expect(mismatch.reasons).toContain("finish_conflict");

    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Wii Blanche"],
        candidateTitles: ["Wii Console White"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");

    expect(
      residualIdentityMatch({
        requestTitles: ["Nintendo Wii Bleu"],
        candidateTitles: ["Blue Wii System"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte Slim Rose ≡ Slim Pink, rejette Slim Rose → Slim bare", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 2 Slim Rose"],
        candidateTitles: ["Slim Playstation 2 System Pink"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");

    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 2 Slim Rose"],
        candidateTitles: ["Playstation 2 Slim System"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
  });

  it("rejette Vita bare → Vita Slim (form factor)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation Vita"],
        candidateTitles: ["PlayStation Vita Slim Console"],
        shelfType: "hardware",
      }).decision,
    ).toBe("reject");
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation Vita"],
        candidateTitles: ["Black PlayStation Vita"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte request Slim quand le catalogue omet Slim (PSP Vibrant Blue)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PSP Slim & Lite Vibrant Blue"],
        candidateTitles: ["PSP-3004 Vibrant Blue"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte Slim Rose ≡ Slim [Pink] (finish dans les brackets)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 2 Slim Rose"],
        candidateTitles: ["Playstation 2 Slim System [Pink]"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });

  it("accepte Silver ≡ Satin Silver (qualifiant finish chrome)", () => {
    expect(
      residualIdentityMatch({
        requestTitles: ["PlayStation 2 Silver"],
        candidateTitles: ["Satin Silver Playstation 2 System"],
        shelfType: "hardware",
      }).decision,
    ).toBe("accept");
  });
});

describe("hardwareProductTitlesAlign", () => {
  it("is the shared prix/metadata/photo gate (FR Bleu ≡ EN Blue)", () => {
    expect(
      hardwareProductTitlesAlign(
        "Blue Nintendo Wii System",
        "Nintendo Wii - Bleu",
      ),
    ).toBe(true);
    expect(
      hardwareProductTitlesAlign(
        "Blue Nintendo Wii System",
        "Nintendo Wii - Rose",
      ),
    ).toBe(false);
  });

  it("aligns regional console aliases via the platform registry (Genesis ≡ Mega Drive)", () => {
    expect(
      hardwareProductTitlesAlign("Sega Genesis", "Sega Mega Drive - Noir"),
    ).toBe(true);
    expect(
      hardwareProductTitlesAlign("Sega Megadrive", "Sega Mega Drive - Noir"),
    ).toBe(true);
    expect(hardwareProductTitlesAlign("Sega Genesis", "Sega Game Gear")).toBe(
      false,
    );
  });

  it("rejects sibling PlayStation generations and Classic ≠ PS One", () => {
    expect(hardwareProductTitlesAlign("PlayStation 5", "PS One")).toBe(false);
    expect(
      hardwareProductTitlesAlign("PlayStation Classic Console", "PS One"),
    ).toBe(false);
    expect(hardwareProductTitlesAlign("PlayStation 5", "PlayStation 4")).toBe(
      false,
    );
  });
});
