import { describe, expect, it } from "vitest";

import {
  NARUTO_PACK_ID,
  isNarutoDataCarddassPrintedRef,
  narutoCatalogueLineForCard,
  narutoCatalogueLineForSealed,
  narutoDataPackForCard,
} from "./packs";

describe("narutoCatalogueLineForCard", () => {
  it("sépare le Carddass de table du CCG américain", () => {
    expect(narutoCatalogueLineForCard("ni001", "s1")).toBe("carddass-fr");
    expect(narutoCatalogueLineForCard("te010")).toBe("carddass-fr");
    expect(narutoCatalogueLineForCard("N-1646")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("J-006")).toBe("en-ccg");
  });

  /*
    Data Carddass arcade vit dans `narutodatacarddass`. Les refs DN/NM ne
    doivent surtout pas tomber en en-ccg (collision N/M).
  */
  it("détecte DN/NM comme arcade hors ligne CCG", () => {
    expect(isNarutoDataCarddassPrintedRef("DN-032T")).toBe(true);
    expect(isNarutoDataCarddassPrintedRef("NM-049")).toBe(true);
    expect(isNarutoDataCarddassPrintedRef("dn-1t")).toBe(true);
    expect(narutoCatalogueLineForCard("DN-032T")).not.toBe("en-ccg");
    expect(narutoCatalogueLineForCard("NM-049")).not.toBe("en-ccg");
  });

  it("ne vole pas les numéros du CCG US, qui commencent aussi par N et M", () => {
    // `NM-` doit être lu avant `N-` : sinon la borne mange le jeu de table.
    expect(narutoCatalogueLineForCard("N-001")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("M-012")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("jus0088", "s6")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("N-US088")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("PR-US001")).toBe("en-ccg");
  });
});

describe("narutoCatalogueLineForSealed", () => {
  it("range le scellé par langue puis par série", () => {
    expect(
      narutoCatalogueLineForSealed({ lang: "EN", slug: "display-s13" }),
    ).toBe("en-ccg");
    expect(
      narutoCatalogueLineForSealed({ lang: "JA", slug: "booster-vol5-jp" }),
    ).toBe("carddass-fr");
    expect(narutoCatalogueLineForSealed({ slug: "display-s20" })).toBe(
      "en-ccg",
    );
    expect(narutoCatalogueLineForSealed({ slug: "booster-s1" })).toBe(
      "carddass-fr",
    );
  });
});

describe("narutoDataPackForCard", () => {
  it("garde un seul pack Carddass sur le disque, quelle que soit la ligne", () => {
    // La ligne est un axe d'étiquetage, pas un second catalogue.
    // DN/NM : autre provider (`narutodatacarddass`) — détectés à part.
    expect(narutoDataPackForCard("ni001", "s1")).toBe(NARUTO_PACK_ID);
    expect(narutoDataPackForCard("N-1646")).toBe(NARUTO_PACK_ID);
    expect(isNarutoDataCarddassPrintedRef("DN-032T")).toBe(true);
  });
});
