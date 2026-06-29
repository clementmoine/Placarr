import { describe, expect, it } from "vitest";

import {
  buildItemSearchConditions,
  itemMatchesSearchQuery,
  itemSearchHaystacks,
} from "./search";

describe("buildItemSearchConditions", () => {
  it("ajoute une condition AND par token pour les requêtes multi-mots", () => {
    const conditions = buildItemSearchConditions("alice madness");
    expect(conditions.some((condition) => "AND" in condition)).toBe(true);
  });

  it("normalise le marqueur de volume et étend le padding (naruto vol 1)", () => {
    const json = JSON.stringify(buildItemSearchConditions("naruto vol 1"));
    expect(json).toContain('"naruto"');
    // Volume 1 expands to padded forms so it matches "Naruto Tome 01".
    expect(json).toContain('"01"');
    // The marker word itself is never a required token.
    expect(json).not.toContain('"vol"');
  });
});

describe("itemMatchesSearchQuery", () => {
  it("matche un alias anglais même quand la ponctuation sépare les mots", () => {
    const haystacks = itemSearchHaystacks({
      name: "Alice Retour Au Pays de la Folie",
      metadata: {
        title: "Alice Retour Au Pays de la Folie",
        aliases: ["Alice: Madness Returns"],
      },
    });

    expect(itemMatchesSearchQuery(haystacks, "alice madness")).toBe(true);
  });

  it("matche encore une phrase exacte sur le titre", () => {
    const haystacks = itemSearchHaystacks({
      name: "Super Mario Galaxy",
      metadata: { title: "Super Mario Galaxy" },
    });

    expect(itemMatchesSearchQuery(haystacks, "mario galaxy")).toBe(true);
  });

  it("ne matche pas si un token est absent partout", () => {
    const haystacks = itemSearchHaystacks({
      name: "Alice Retour Au Pays de la Folie",
      metadata: {
        title: "Alice Retour Au Pays de la Folie",
        aliases: [],
      },
    });

    expect(itemMatchesSearchQuery(haystacks, "alice madness")).toBe(false);
  });

  it("matche un alias romaji même quand le titre affiché est en français", () => {
    const haystacks = itemSearchHaystacks({
      name: "L'Attaque des Titans n°1",
      metadata: {
        title: "L'Attaque des Titans n°1",
        aliases: ["Shingeki no Kyojin", "Attack on Titan"],
      },
    });

    expect(itemMatchesSearchQuery(haystacks, "shingeki")).toBe(true);
    expect(itemMatchesSearchQuery(haystacks, "attack on titan")).toBe(true);
  });
});

describe("itemMatchesSearchQuery — volume marqueur/padding indifférents", () => {
  const naruto = itemSearchHaystacks({
    name: "Naruto Tome 01",
    metadata: { title: "Naruto Tome 01" },
  });

  it.each([
    "naruto 1",
    "naruto 01",
    "naruto vol 1",
    "naruto vol. 01",
    "naruto volume 01",
    "naruto n°01",
    "naruto n°1",
    "naruto tome 1",
    "naruto #1",
  ])("trouve « Naruto Tome 01 » via « %s »", (query) => {
    expect(itemMatchesSearchQuery(naruto, query)).toBe(true);
  });

  it("ne matche pas un autre numéro de volume", () => {
    expect(itemMatchesSearchQuery(naruto, "naruto 5")).toBe(false);
  });

  const picsou = itemSearchHaystacks({
    name: "Super Picsou Géant n°36",
    metadata: { title: "Super Picsou Géant n°36" },
  });

  it.each(["super picsou 36", "super picsou n°036", "super picsou #36"])(
    "trouve « n°36 » via « %s »",
    (query) => {
      expect(itemMatchesSearchQuery(picsou, query)).toBe(true);
    },
  );
});
