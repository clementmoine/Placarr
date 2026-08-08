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
    const dbPath = path.join(dir, "lorcana.sqlite");

    writeLorcanaTcgIndex({
      dbPath,
      languages: ["fr", "en"],
      prints: [
        {
          printKey: "1-1",
          setCode: "1",
          number: "1",
          providerId: "abc",
          cost: 4,
          artists: ["Alice"],
          foilTypes: ["Satin"],
          varnishType: "HighGloss",
          cardmarketUrl: "https://example.test/cm",
        },
      ],
      titles: [
        {
          printKey: "1-1",
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
          searchName: "ariel sur ses jambes",
          imageUrl: "https://cdn.example/fr/art.jpg",
          foilMaskUrl: "https://cdn.example/fr/mask.jpg",
        },
        {
          printKey: "1-1",
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
          printKey: "1-1",
          lang: "fr",
          art: "art.jpg",
          foilMask: "foil_mask.jpg",
        },
        {
          printKey: "1-1",
          lang: "en",
          art: "art.jpg",
        },
      ],
    });

    const fr = lookupLorcanaTcgTitle("1-1", "fr", dbPath);
    expect(fr?.fullName).toBe("Ariel - Sur ses jambes");
    expect(fr?.flavorText).toBe("Elle rêve de terre ferme.");
    expect(fr?.setName).toBe("Premier Chapitre");
    expect(fr?.cardType).toBe("Personnage");
    expect(fr?.imageUrl).toBe("https://cdn.example/fr/art.jpg");
    expect(fr?.foilMaskUrl).toBe("https://cdn.example/fr/mask.jpg");

    const en = lookupLorcanaTcgTitle("1-1", "en", dbPath);
    expect(en?.fullName).toBe("Ariel - On Human Legs");
    expect(en?.color).toBe("Amethyst");

    const print = lookupLorcanaTcgPrint("1-1", dbPath);
    expect(print?.cost).toBe(4);
    expect(print?.artists).toEqual(["Alice"]);
    expect(print?.foilTypes).toEqual(["Satin"]);
    expect(print?.varnishType).toBe("HighGloss");
    expect(print?.cardmarketUrl).toBe("https://example.test/cm");

    const json = exportLorcanaCardsIndexJson(dbPath);
    expect(json?.printCount).toBe(1);
    expect(json?.schemaVersion).toBe("2");
    expect(json?.cards["1-1"]?.fr).toEqual({
      art: "art.jpg",
      foilMask: "foil_mask.jpg",
    });
    expect(json?.cards["1-1"]?.en?.art).toBe("art.jpg");
  });
});
