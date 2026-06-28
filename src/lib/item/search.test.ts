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
