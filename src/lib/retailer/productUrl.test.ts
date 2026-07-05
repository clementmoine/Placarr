import { describe, expect, it } from "vitest";

import {
  retailerCatalogBarcodeGate,
  retailerBarcodeContradictsItem,
  retailerProductBarcodeConfirmed,
  retailerProductUrlBarcodeConflicts,
} from "./productUrl";

describe("retailerProductUrlBarcodeConflicts", () => {
  it("flags a slug EAN that differs from the requested item barcode", () => {
    expect(
      retailerProductUrlBarcodeConflicts(
        "https://lesgentlemendujeu.com/jeux-d-enquetes/6805-black-stories-827912079678.html",
        "0626570607465",
      ),
    ).toBe(true);
  });

  it("allows URLs that embed the same EAN", () => {
    expect(
      retailerProductUrlBarcodeConflicts(
        "https://www.ludocortex.fr/jeux-de-societe/808-black-stories-faits-vecus-kikigagne-0626570607465.html",
        "0626570607465",
      ),
    ).toBe(false);
  });
});

describe("retailerProductBarcodeConfirmed", () => {
  it("accepts Philibert slugs that embed the same EAN with or without a leading zero", () => {
    expect(
      retailerProductBarcodeConfirmed(
        "https://www.philibertnet.com/fr/kikigagne/8940-black-stories-vf-827912079678.html",
        "827912079678",
        "0827912079678",
      ),
    ).toBe(true);
  });

  it("rejects a different EAN embedded in the slug", () => {
    expect(
      retailerProductBarcodeConfirmed(
        "https://www.philibertnet.com/fr/kikigagne/41476-black-stories-suspect-087169139338.html",
        "087169139338",
        "0827912079678",
      ),
    ).toBe(false);
  });
});

describe("retailerCatalogBarcodeGate", () => {
  it("confirms via slug when field barcode uses a leading-zero variant", () => {
    expect(
      retailerCatalogBarcodeGate({
        productUrl:
          "https://lesgentlemendujeu.com/jeux-d-enquetes/6805-black-stories-827912079678.html",
        productBarcode: "827912079678",
        itemBarcode: "0827912079678",
      }),
    ).toEqual({
      catalogBarcodeConfirmed: true,
      barcodeContradicted: false,
      urlBarcodeConflicts: false,
    });
  });

  it("flags slug and field mismatches against the item barcode", () => {
    expect(
      retailerCatalogBarcodeGate({
        productUrl:
          "https://www.monsieurde.com/famille/999-black-stories-suspect-087169139338.html",
        productBarcode: "087169139338",
        itemBarcode: "0827912079678",
      }),
    ).toEqual({
      catalogBarcodeConfirmed: false,
      barcodeContradicted: true,
      urlBarcodeConflicts: true,
    });
  });
});

describe("retailerBarcodeContradictsItem", () => {
  it("rejects when the page GTIN differs from the item barcode", () => {
    expect(
      retailerBarcodeContradictsItem({
        productBarcode: "05906395350148",
        itemBarcode: "0827912079678",
      }),
    ).toBe(true);
  });

  it("does not reject when the source exposes no GTIN", () => {
    expect(
      retailerBarcodeContradictsItem({
        productUrl:
          "https://www.chasse-aux-livres.fr/prix/B071ZXH7MV/black-stories-fantastique",
        itemBarcode: "0827912079678",
      }),
    ).toBe(false);
  });
});
