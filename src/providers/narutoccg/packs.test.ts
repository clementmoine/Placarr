import { describe, expect, it } from "vitest";

import {
  NARUTO_PACK_ID,
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
    Les cartes de borne d'arcade partagent le pack sans partager la série :
    `DN-…T` vient de ナルティメットカードバトル (2005), `NM-…` de
    ナルティメットミッション (2007). Elles étaient jusqu'ici filtrées à la
    lecture, faute d'endroit où les mettre.
  */
  it("reconnaît les deux cabinets Data Carddass", () => {
    expect(narutoCatalogueLineForCard("DN-032T")).toBe("data-carddass");
    expect(narutoCatalogueLineForCard("NM-049")).toBe("data-carddass");
    expect(narutoCatalogueLineForCard("dn-1t")).toBe("data-carddass");
  });

  it("ne vole pas les numéros du CCG US, qui commencent aussi par N et M", () => {
    // `NM-` doit être lu avant `N-` : sinon la borne mange le jeu de table.
    expect(narutoCatalogueLineForCard("N-001")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("M-012")).toBe("en-ccg");
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
  it("garde un seul pack sur le disque, quelle que soit la ligne", () => {
    // La ligne est un axe d'étiquetage, pas un second catalogue.
    expect(narutoDataPackForCard("ni001", "s1")).toBe(NARUTO_PACK_ID);
    expect(narutoDataPackForCard("N-1646")).toBe(NARUTO_PACK_ID);
    expect(narutoDataPackForCard("DN-032T")).toBe(NARUTO_PACK_ID);
  });
});
