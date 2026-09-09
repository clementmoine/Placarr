import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  exportLorcanaCardsIndexJson,
  lookupLorcanaTcgPrint,
  lookupLorcanaTcgTitle,
  resetLorcanaTcgDbCache,
  writeLorcanaTcgIndex,
} from "./indexStore";

describe("lorcanatcg indexStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    resetLorcanaTcgDbCache();
    while (dirs.length) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  it("writes full catalogue row + assets and exports cards-index json", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "lorcanatcg-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "catalog.sqlite");

    writeLorcanaTcgIndex({
      dbPath,
      languages: ["fr", "en"],
      prints: [
        {
          printKey: "lorcana:1-1",
          setCode: "1",
          number: "1",
          providerId: "abc",
          cost: 4,
          artists: ["Alice"],
          foilTypes: ["Satin"],
          varnishType: "HighGloss",
          cardmarketUrl: "https://example.test/cm",
          lore: 2,
          strength: 3,
          willpower: 4,
          inkwell: true,
          setCardCount: 204,
        },
      ],
      titles: [
        {
          printKey: "lorcana:1-1",
          lang: "fr",
          fullName: "Ariel - Sur ses jambes",
          name: "Ariel",
          version: "Sur ses jambes",
          setName: "Premier Chapitre",
          rarity: "Rare",
          cardType: "Personnage",
          color: "Améthyste",
          story: "La Petite Sirène",
          flavorText: "Elle rêve de terre ferme.",
          subtypes: ["Née du récit", "Héros", "Princesse"],
          searchName: "ariel sur ses jambes",
          imageUrl: "https://cdn.example/fr/art.jpg",
          foilMaskUrl: "https://cdn.example/fr/mask.jpg",
        },
        {
          printKey: "lorcana:1-1",
          lang: "en",
          fullName: "Ariel - On Human Legs",
          name: "Ariel",
          version: "On Human Legs",
          setName: "The First Chapter",
          rarity: "Rare",
          cardType: "Character",
          color: "Amethyst",
          flavorText: "She dreams of dry land.",
          imageUrl: "https://cdn.example/en/art.jpg",
        },
      ],
      assets: [
        {
          printKey: "lorcana:1-1",
          lang: "fr",
          art: "art.jpg",
          foilMask: "mask.jpg",
        },
        {
          printKey: "lorcana:1-1",
          lang: "en",
          art: "art.jpg",
        },
      ],
    });

    const fr = lookupLorcanaTcgTitle("lorcana:1-1", "fr", dbPath);
    expect(fr?.fullName).toBe("Ariel - Sur ses jambes");
    expect(fr?.flavorText).toBe("Elle rêve de terre ferme.");
    expect(fr?.setName).toBe("Premier Chapitre");
    expect(fr?.cardType).toBe("Personnage");
    expect(fr?.imageUrl).toBe("https://cdn.example/fr/art.jpg");
    expect(fr?.foilMaskUrl).toBe("https://cdn.example/fr/mask.jpg");

    const en = lookupLorcanaTcgTitle("lorcana:1-1", "en", dbPath);
    expect(en?.fullName).toBe("Ariel - On Human Legs");
    expect(en?.color).toBe("Amethyst");

    const print = lookupLorcanaTcgPrint("lorcana:1-1", dbPath);
    expect(print?.cost).toBe(4);
    expect(print?.artists).toEqual(["Alice"]);
    expect(print?.foilTypes).toEqual(["Satin"]);
    expect(print?.varnishType).toBe("HighGloss");
    expect(print?.cardmarketUrl).toBe("https://example.test/cm");

    const json = exportLorcanaCardsIndexJson(dbPath);
    expect(json?.version).toBe(1);
    expect(json?.pack).toBe("lorcana");
    expect(Object.keys(json?.cards ?? {})).toHaveLength(1);
    expect(json?.cards["lorcana:1-1"]).toEqual({
      set: "1",
      card: "1",
      name: "Ariel - Sur ses jambes",
      langs: {
        fr: {
          art: "art.jpg",
          mask: "mask.jpg",
          name: "Ariel - Sur ses jambes",
        },
        en: { art: "art.jpg", name: "Ariel - On Human Legs" },
      },
    });
  });

  it("attaches sibling titles with nameSource when a lang has art but no title", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "lorcanatcg-sib-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "catalog.sqlite");

    writeLorcanaTcgIndex({
      dbPath,
      languages: ["fr", "de"],
      prints: [
        {
          printKey: "lorcana:1-9",
          setCode: "1",
          number: "9",
        },
      ],
      titles: [
        {
          printKey: "lorcana:1-9",
          lang: "fr",
          fullName: "Mickey - Brave Petit Tailleur",
        },
      ],
      assets: [
        {
          printKey: "lorcana:1-9",
          lang: "fr",
          art: "art.fr.jpg",
        },
        {
          printKey: "lorcana:1-9",
          lang: "de",
          art: "art.de.jpg",
        },
      ],
    });

    const json = exportLorcanaCardsIndexJson(dbPath);
    expect(json?.cards["lorcana:1-9"]?.langs.fr?.name).toBe(
      "Mickey - Brave Petit Tailleur",
    );
    expect(json?.cards["lorcana:1-9"]?.langs.de).toEqual({
      art: "art.de.jpg",
      name: "Mickey - Brave Petit Tailleur",
      nameSource: "fr",
    });
  });
});

describe("lorcanatcg — les chiffres du jeu", () => {
  const dirs: string[] = [];
  afterEach(() => {
    resetLorcanaTcgDbCache();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  /*
    Lore, force, volonté, encrier et taille de set étaient lus par le provider
    puis jetés à l'écriture : la table n'avait pas de colonne. Les sous-types,
    eux, sont traduits — ils vont avec la langue, pas avec le tirage.
  */
  it("garde lore / force / volonté / encrier / taille de set, et les sous-types par langue", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "lorcanatcg-stats-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "catalog.sqlite");

    writeLorcanaTcgIndex({
      dbPath,
      languages: ["fr"],
      prints: [
        {
          printKey: "lorcana:1-2",
          setCode: "1",
          number: "2",
          lore: 1,
          strength: 5,
          willpower: 6,
          inkwell: false,
          setCardCount: 204,
        },
      ],
      titles: [
        {
          printKey: "lorcana:1-2",
          lang: "fr",
          fullName: "Sébastien - Chef d'orchestre",
          subtypes: ["Né du récit", "Allié"],
        },
      ],
      assets: [],
    });

    const print = lookupLorcanaTcgPrint("lorcana:1-2", dbPath);
    expect(print).toMatchObject({
      lore: 1,
      strength: 5,
      willpower: 6,
      setCardCount: 204,
    });
    // `false` doit survivre au passage par l'entier SQLite, pas devenir null.
    expect(print?.inkwell).toBe(false);
    expect(
      lookupLorcanaTcgTitle("lorcana:1-2", "fr", dbPath)?.subtypes,
    ).toEqual(["Né du récit", "Allié"]);
  });
});
