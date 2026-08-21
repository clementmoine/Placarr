import { describe, expect, it } from "vitest";

import { narutoSetsUnreleasedInFrench } from "./facts";
import { isNarutoLangPrinted, preferNarutoAppearanceSet } from "./printed";

describe("isNarutoLangPrinted", () => {
  it("keeps S6 French off the add picker", () => {
    expect(isNarutoLangPrinted("s6", "fr")).toBe(false);
    expect(isNarutoLangPrinted("s6", "it")).toBe(true);
    expect(isNarutoLangPrinted("s1", "fr")).toBe(true);
    expect(isNarutoLangPrinted("s28", "fr")).toBe(true);
    expect(isNarutoLangPrinted("s28", "en")).toBe(true);
  });
});

describe("preferNarutoAppearanceSet", () => {
  it("does not let an Italian S6 face replace a French retail series", () => {
    expect(preferNarutoAppearanceSet("s2", "s6")).toBe("s2");
    expect(preferNarutoAppearanceSet("s6", "s2")).toBe("s2");
    expect(preferNarutoAppearanceSet("unknown", "s6")).toBe("s6");
    expect(preferNarutoAppearanceSet("s6", "s6")).toBe("s6");
  });
});

/*
  Le fait « annulée en France » vit dans le registre (`released: false` + la
  note `cancelled`), et **une seule fois**. Il était aussi codé en dur ici, et
  le filtre de langue s'apprêtait à en faire une troisième copie : deux d'entre
  elles se seraient tues le jour où un autre set subirait le même sort.
*/
describe("le registre est la seule source", () => {
  it("reads the cancellation from the ledger, not from a hardcoded set id", () => {
    expect([...narutoSetsUnreleasedInFrench()]).toEqual(["s6"]);
    expect(isNarutoLangPrinted("s6", "fr")).toBe(false);
  });

  /*
    Les cartes existent, imprimées en Italie — « Serie 6 — Rivalità Eterna ».
    L'annulation vaut pour le français seul, jamais pour les autres langues.
  */
  it("cancels the French slot only", () => {
    for (const lang of ["it", "en", "ja"]) {
      expect(isNarutoLangPrinted("s6", lang), lang).toBe(true);
    }
  });
});
