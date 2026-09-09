import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parsePrimegameExpansions,
  parsePrimegameSinglesAjax,
  parsePrimegameSinglesResultCount,
  primegameExpansionSetCode,
} from "./parsePrimegameIt";

const FIXTURE = path.join(
  import.meta.dirname,
  "../scrape/fixtures/primegame-naruto-hub.html",
);

describe("parsePrimegameIt", () => {
  it("reads expansion rubrics from the Naruto singles hub", () => {
    const html = readFileSync(FIXTURE, "utf8");
    const expansions = parsePrimegameExpansions(html);
    expect(expansions.map((row) => row.expansionId)).toEqual([
      38, 39, 40, 41, 42, 43, 175, 196, 201,
    ]);
    expect(primegameExpansionSetCode(175)).toBe("s6");
    expect(primegameExpansionSetCode(196)).toBe("s7");
  });

  it("parses ajax rows when the shop has stock", () => {
    const html = `
<div class="parte_prodotti">
<div class="product-item style1">
  <div class="product-inner">
    <div class="product-thumb"><a href="/Product/99123/Naruto_Uzumaki"><img src="https://www.tcgtrend.it/sthumb/400/99123" alt=""></a></div>
    <div class="product-innfo">
      <div class="product-name"><a href="/Product/99123/Naruto_Uzumaki">NI-01 Naruto Uzumaki</a></div>
    </div>
  </div>
</div>
</div>
<span Class="show-resuilt">Showing 1-1 of 1 result(s)</span>`;
    expect(parsePrimegameSinglesResultCount(html)).toBe(1);
    const cards = parsePrimegameSinglesAjax(html, {
      expansionId: 38,
      slug: "La_Forza_della_Foglia",
      name: "La Forza della Foglia",
      setCode: "s1",
    });
    expect(cards).toEqual([
      expect.objectContaining({
        number: "ni001",
        printedRef: "NI-01",
        name: "Naruto Uzumaki",
        productId: 99123,
        thumbUrl: "https://www.tcgtrend.it/sthumb/1000/99123",
      }),
    ]);
  });
});
