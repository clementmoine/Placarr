/*
  La boutique ne dit pas la famille de ses cartes : « Baki 130 » peut être
  忍-130 comme 術-130. Deux signaux indépendants la donnent — le nom anglais,
  qui joint le catalogue CCG américain, et le volume, dont les plages de numéros
  sont connues. Sur les 227 produits ils se prononcent ensemble 15 fois et ne se
  contredisent jamais ; c'est cette absence de désaccord qui autorise à faire
  confiance aux cas où un seul parle.
*/
import { describe, expect, it } from "vitest";

import {
  chitoroVolumeSetCode,
  japaneseFamilyOf,
  normalizeShopName,
  parseChitoroTitle,
  resolveChitoroIdentity,
  resolveChitoroNameFamily,
} from "./parseChitoroshop";

describe("identifier une carte de chitoroshop", () => {
  it("reads the name and the number off the title", () => {
    expect(parseChitoroTitle("Baki 130 | Naruto Card Game")).toEqual({
      name: "baki",
      number: 130,
    });
    expect(parseChitoroTitle("Gaara of the desert 295 | X")).toEqual({
      name: "gaara of the desert",
      number: 295,
    });
  });

  /*
    La boutique ajoute parfois une rareté ou un surnom (« Hime UR ») après le
    nom CCG. Le préfixe catalogue le plus long qui matche encore le titre
    récupère la famille — sans liste magique de tokens.
  */
  it("joins a shop title that lengthens the catalog EN name", () => {
    const index = new Map<string, Set<string>>([
      ["tsunade|354", new Set(["ni"])],
      ["chakra rope|354", new Set(["te"])],
    ]);
    expect(resolveChitoroNameFamily(index, "tsunade hime ur", 354)).toBe("ni");
    expect(resolveChitoroNameFamily(index, "tsunade", 354)).toBe("ni");
    expect(resolveChitoroNameFamily(index, "gaara of the desert", 295)).toBeNull();
  });

  /*
    La collection tient aussi des autocollants et de la Data Carddass, qui ne
    sont pas des cartes de ce jeu. 85 des 227 produits sont dans ce cas.
  */
  it("refuses a title that is not a card of this game", () => {
    expect(
      parseChitoroTitle("Orochimaru 2-26 N | Naruto Wafer Stickers"),
    ).toBeNull();
    expect(parseChitoroTitle("Naruto Card Game")).toBeNull();
  });

  it("folds accents, so Kidōmaru meets Kidomaru", () => {
    expect(normalizeShopName("Kidōmaru")).toBe(normalizeShopName("Kidomaru"));
  });

  it("reads the volume the shop prints", () => {
    expect(chitoroVolumeSetCode("Naruto Card Game Vol.6 (2004)")).toBe("maki6");
    expect(chitoroVolumeSetCode("Vol. 13 | BANDAI")).toBe("maki13");
    expect(chitoroVolumeSetCode("Naruto Card Game | Promo")).toBeNull();
  });

  /** Le catalogue américain numérote `n`/`j`/`m` ce que le japonais dit 忍/術/作. */
  it("translates the American family into the Japanese one", () => {
    expect(japaneseFamilyOf("n")).toBe("ni");
    expect(japaneseFamilyOf("j")).toBe("te");
    expect(japaneseFamilyOf("m")).toBe("ta");
    expect(japaneseFamilyOf("zzz")).toBeNull();
  });

  /*
    Un désaccord ne se tranche pas. Il ne s'en est présenté aucun, et le jour où
    il s'en présentera un, c'est qu'une des deux tables est fausse — pas qu'il
    faut départager au hasard.
  */
  it("refuses to choose when the two signals disagree", () => {
    expect(
      resolveChitoroIdentity({ number: 130, byName: "ni", byVolume: "te" }),
    ).toBeNull();
  });

  it("marks what decided, so a doubt stays traceable", () => {
    expect(
      resolveChitoroIdentity({ number: 130, byName: "ni", byVolume: "ni" }),
    ).toEqual({ family: "ni", number: 130, by: "both" });
    expect(
      resolveChitoroIdentity({ number: 130, byName: "ni", byVolume: null }),
    ).toEqual({ family: "ni", number: 130, by: "name" });
    expect(
      resolveChitoroIdentity({ number: 130, byName: null, byVolume: null }),
    ).toBeNull();
  });
});
