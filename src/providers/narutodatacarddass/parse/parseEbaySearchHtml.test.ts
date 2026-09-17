import { describe, expect, it } from "vitest";

import { parseEbayDataCarddassSearchHtml } from "./parseEbaySearchHtml";

describe("parseEbayDataCarddassSearchHtml", () => {
  it("extracts printedRef + imageId from pasted search HTML", () => {
    const html = `
      <a href="https://www.ebay.fr/itm/187160256573">
        <img src="https://i.ebayimg.com/images/g/DxkAAOSwyhZoBa93/s-l500.webp"/>
        <span>NFP-017 Promo Uchiha Sasuke Naruto Data Carddass</span>
      </a>
      <a href="https://www.ebay.fr/itm/186247937473">
        <img src="https://i.ebayimg.com/images/g/KiMAAOSwSt1ln04z/s-l225.webp"/>
        NARUTO Ultimate Cross orochimaru NX-290 Shippuden
      </a>
    `;
    const faces = parseEbayDataCarddassSearchHtml(html);
    expect(faces.map((f) => f.printedRef).sort()).toEqual([
      "NFP-17",
      "NX-290",
    ]);
    expect(faces.find((f) => f.printedRef === "NX-290")?.imageId).toBe(
      "KiMAAOSwSt1ln04z",
    );
    expect(faces[0]!.url).toMatch(/\/s-l1600\.webp$/);
  });

  it("skips ambiguous NXP-SP romans", () => {
    const html = `
      <a href="https://www.ebay.fr/itm/186019830697">
        <img src="https://i.ebayimg.com/images/g/1C0AAOSwmnFkzGH1/s-l500.webp"/>
        SASUKE NXP-SPⅡ promo
      </a>
    `;
    expect(parseEbayDataCarddassSearchHtml(html)).toEqual([]);
  });
});
