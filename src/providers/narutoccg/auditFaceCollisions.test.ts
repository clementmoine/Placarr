import { describe, expect, it } from "vitest";

import {
  collisionsFrom,
  titleMismatches,
  type FaceRef,
} from "./auditFaceCollisions";

function refs(...cards: [string, string][]): FaceRef[] {
  return cards.map(([card, source]) => ({
    card,
    lang: "en",
    source,
    file: `${card}/${source}`,
  }));
}

describe("collisionsFrom", () => {
  const titles: Record<string, string> = {
    j1033: "SPATTER'S RUSH",
    j1043: "Lightning Blade Single Slash",
    n0100: "Naruto Uzumaki",
    n0200: "Naruto Uzumaki",
  };
  const titleOf = (card: string) => titles[card] ?? null;

  it("signale deux tirages de titres différents qui partagent les mêmes octets", () => {
    const found = collisionsFrom(
      new Map([["h1", refs(["j1033", "vintage"], ["j1043", "vintage"])]]),
      titleOf,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reprint: false });
    expect(found[0]?.cards.sort()).toEqual(["j1033", "j1043"]);
  });

  /*
    Le jeu rejoue la même illustration d'un set à l'autre : deux numéros au
    même nom qui partagent une image, c'est une réimpression, pas une faute.
    Sans cette distinction l'outil crierait 57 fois pour rien.
  */
  it("laisse passer une réimpression : même nom sous deux numéros", () => {
    const found = collisionsFrom(
      new Map([["h1", refs(["n0100", "drive"], ["n0200", "drive"])]]),
      titleOf,
    );
    expect(found[0]?.reprint).toBe(true);
  });

  it("ne dit rien d'une image qui n'appartient qu'à un tirage", () => {
    expect(
      collisionsFrom(new Map([["h1", refs(["j1033", "drive"])]]), titleOf),
    ).toEqual([]);
  });

  it("met les cas douteux devant les réimpressions", () => {
    const found = collisionsFrom(
      new Map([
        ["h1", refs(["n0100", "drive"], ["n0200", "drive"])],
        ["h2", refs(["j1033", "vintage"], ["j1043", "vintage"])],
      ]),
      titleOf,
    );
    expect(found[0]?.reprint).toBe(false);
    expect(found[1]?.reprint).toBe(true);
  });

  it("garde la trace des sources en cause", () => {
    const found = collisionsFrom(
      new Map([["h1", refs(["j1033", "vintage"], ["j1043", "drive"])]]),
      titleOf,
    );
    expect(found[0]?.sources.sort()).toEqual(["drive", "vintage"]);
  });
});

describe("titleMismatches", () => {
  const shown = [
    { card: "n0849", lang: "en", source: "drive" },
    { card: "n1815", lang: "en", source: "vintage" },
  ];
  const catalogue: Record<string, string> = {
    n0849: "Ghost Samurai",
    n1815: "Sakura Haruno",
  };
  const source: Record<string, string> = {
    n0849: "Cursed Warrior",
    n1815: "sakura haruno",
  };

  it("signale une face dont le relevé nomme autrement que notre titre", () => {
    const found = titleMismatches(
      shown,
      (c) => catalogue[c] ?? null,
      (_s, c) => source[c] ?? null,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      card: "n0849",
      catalogue: "Ghost Samurai",
      sourceName: "Cursed Warrior",
    });
  });

  it("ne s'arrête pas à la casse ni aux espaces", () => {
    // `sakura haruno` et `Sakura Haruno` sont le même nom.
    const found = titleMismatches(
      [shown[1]!],
      (c) => catalogue[c] ?? null,
      (_s, c) => source[c] ?? null,
    );
    expect(found).toEqual([]);
  });

  it("se tait quand l'un des deux noms manque", () => {
    expect(
      titleMismatches(
        shown,
        () => null,
        () => "quelque chose",
      ),
    ).toEqual([]);
    expect(
      titleMismatches(
        shown,
        (c) => catalogue[c] ?? null,
        () => null,
      ),
    ).toEqual([]);
  });
});
