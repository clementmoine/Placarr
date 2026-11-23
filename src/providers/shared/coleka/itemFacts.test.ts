import { describe, expect, it } from "vitest";

import { parseColekaItemFacts } from "./itemFacts";

/** Liste `<dt>/<dd>` d'une fiche objet (copie Wayback 2025-06-09). */
const ITEM = `
<dl>
  <dt>Date de sortie</dt>
  <dd>24 octobre 2017<span class="hid" itemprop="releaseDate">2017-10-24</span></dd>
  <dt>Prix dans le commerce</dt>
  <dd>2,99 € ()</dd>
  <dt>Licence</dt>
  <dd>Star Wars</dd>
</dl>`;

describe("parseColekaItemFacts", () => {
  it("lit date de sortie et prix dans le commerce", () => {
    expect(parseColekaItemFacts(ITEM)).toEqual({
      releaseDate: "2017-10-24",
      retailPriceCents: 299,
    });
  });

  it("accepte un prix entier (« 2€ »)", () => {
    expect(
      parseColekaItemFacts(ITEM.replace("2,99 € ()", "2€ ()")).retailPriceCents,
    ).toBe(200);
  });

  it("rend null quand les champs manquent", () => {
    expect(parseColekaItemFacts("<dl><dt>Licence</dt><dd>x</dd></dl>")).toEqual(
      {
        releaseDate: null,
        retailPriceCents: null,
      },
    );
  });
});
