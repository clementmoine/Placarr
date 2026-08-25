/*
  Le set est dans l'URL de chaque carte, ce qui évite d'ouvrir quatre mille
  fiches pour une information déjà servie par la page d'index.
*/
import { describe, expect, it } from "vitest";

import {
  ggCardName,
  ggCardsMissingFrom,
  ggSetLabel,
  parseGgCardIndex,
} from "./parseNarutoCardGameGg";

const HTML = `
  <a href="/archive/classic-ccg/the-path-to-hokage/n001-naruto-uzumaki">n001</a>
  <a href="/archive/classic-ccg/the-path-to-hokage/j001-kunai">j001</a>
  <a href="/archive/classic-ccg/coils-of-the-snake/c001-inari">c001</a>
  <a href="/archive/classic-ccg/the-path-to-hokage/n001-naruto-uzumaki">doublon</a>
  <a href="/cards">le jeu de 2027, pas celui-ci</a>
`;

describe("base narutocardgame.gg", () => {
  it("reads the prefix, the number and the set straight from the URL", () => {
    expect(parseGgCardIndex(HTML)).toEqual([
      {
        prefix: "n",
        number: 1,
        set: "the-path-to-hokage",
        slug: "naruto-uzumaki",
      },
      { prefix: "j", number: 1, set: "the-path-to-hokage", slug: "kunai" },
      { prefix: "c", number: 1, set: "coils-of-the-snake", slug: "inari" },
    ]);
  });

  /*
    La page lie certaines cartes deux fois. Les compter deux fois fausserait
    toute comparaison avec notre catalogue.
  */
  it("counts a card once, however many times the page links it", () => {
    expect(parseGgCardIndex(HTML)).toHaveLength(3);
  });

  /** `/cards` à la racine est le jeu de 2027 : rien à en tirer ici. */
  it("ignores links that are not cards of this game", () => {
    expect(parseGgCardIndex('<a href="/cards">x</a>')).toEqual([]);
  });

  it("turns a slug back into something readable", () => {
    expect(ggSetLabel("the-path-to-hokage")).toBe("The Path To Hokage");
    expect(ggCardName("naruto-uzumaki")).toBe("Naruto Uzumaki");
  });

  /*
    On rend l'écart, pas une fusion : `nc` et `ex` sont des familles dont on
    ignore la règle de numérotation, et les verser sans les avoir identifiées
    reviendrait à inventer des cartes.
  */
  it("reports what we lack rather than merging it in", () => {
    const cards = parseGgCardIndex(HTML);
    expect(ggCardsMissingFrom(cards, new Set(["n1", "j1"]))).toEqual([
      { prefix: "c", number: 1, set: "coils-of-the-snake", slug: "inari" },
    ]);
    expect(ggCardsMissingFrom(cards, new Set())).toHaveLength(3);
  });
});
