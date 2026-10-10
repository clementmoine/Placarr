import { describe, expect, it } from "vitest";

import { collectorQueryClause } from "./indexStore";

/**
 * `36/P2` est la référence que porte la carte, et donc celle qu'on tape. Aucune
 * colonne ne la tient sous cette forme : le catalogue range cette promo en
 * `p2 · 36`, et une carte d'extension `12/204` en `1 · 12`, où `204` est la
 * taille du set et non son code. La recherche rendait zéro sur les deux.
 */
describe("collectorQueryClause", () => {
  it("lit une promo dans les deux ordres", () => {
    const slash = collectorQueryClause("36/p2");
    expect(slash?.params).toEqual(["p2", 36]);
    expect(collectorQueryClause("p2 36")?.params).toEqual(["p2", 36]);
    expect(collectorQueryClause("p2-36")?.params).toEqual(["p2", 36]);
    // La clause interroge le groupe promo, avec l'extension en repli.
    expect(slash?.clause).toContain("promo_grouping");
    expect(slash?.clause).toContain("set_code");
  });

  it("accepte le point médian des vitrines", () => {
    expect(collectorQueryClause("36 • p2")?.params).toEqual(["p2", 36]);
  });

  it("traite le second nombre d'une extension comme sa taille", () => {
    const clause = collectorQueryClause("12/204");
    expect(clause?.params).toEqual([204, 12]);
    expect(clause?.clause).toContain("set_card_count");
  });

  it("laisse passer ce qui n'est pas une référence", () => {
    expect(collectorQueryClause("elsa")).toBeNull();
    expect(collectorQueryClause("mickey mouse true friend")).toBeNull();
    // Deux segments, mais aucun nombre : c'est un nom coupé en deux.
    expect(collectorQueryClause("snow white")).toBeNull();
  });
});
