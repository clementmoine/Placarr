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
  splitCompoundGgId,
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
        rawId: "n001",
        line: "classic-ccg",
      },
      {
        prefix: "j",
        number: 1,
        set: "the-path-to-hokage",
        slug: "kunai",
        rawId: "j001",
        line: "classic-ccg",
      },
      {
        prefix: "c",
        number: 1,
        set: "coils-of-the-snake",
        slug: "inari",
        rawId: "c001",
        line: "classic-ccg",
      },
    ]);
  });

  it("counts a card once, however many times the page links it", () => {
    expect(parseGgCardIndex(HTML)).toHaveLength(3);
  });

  it("ignores links that are not cards of this game", () => {
    expect(parseGgCardIndex('<a href="/cards">x</a>')).toEqual([]);
  });

  it("turns a slug back into something readable", () => {
    expect(ggSetLabel("the-path-to-hokage")).toBe("The Path To Hokage");
    expect(ggCardName("naruto-uzumaki")).toBe("Naruto Uzumaki");
  });

  it("reports what we lack rather than merging it in", () => {
    const cards = parseGgCardIndex(HTML);
    expect(ggCardsMissingFrom(cards, new Set(["n1", "j1"]))).toEqual([
      {
        prefix: "c",
        number: 1,
        set: "coils-of-the-snake",
        slug: "inari",
        rawId: "c001",
        line: "classic-ccg",
      },
    ]);
    expect(ggCardsMissingFrom(cards, new Set())).toHaveLength(3);
  });

  it("parses kayou compound ids", () => {
    const html = `
      <a href="/archive/kayou/cards/nrz08-asp-001-naruto-uzumaki">a</a>
      <a href="/archive/kayou/cards/nrz08-asp-001-naruto-uzumaki">dup</a>
      <a href="/archive/mythos/cards/ks-000-gold-naruto">m</a>
    `;
    expect(parseGgCardIndex(html, "kayou")).toEqual([
      {
        prefix: "nrz08-asp",
        number: 1,
        set: "kayou",
        slug: "naruto-uzumaki",
        rawId: "nrz08-asp-001",
        line: "kayou",
      },
    ]);
    expect(parseGgCardIndex(html, "mythos")[0]?.rawId).toBe("ks-000");
    expect(splitCompoundGgId("ks-007")).toEqual({ prefix: "ks", number: 7 });
  });
});
