import { describe, expect, it } from "vitest";

import { retailerProductUrlBarcodeConflicts } from "./productUrl";

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
