/**
 * Parse dbzcollection.fr Lamincards FR listings.
 */
import { describe, expect, it } from "vitest";

import {
  parseDbzcCardInfo,
  parseDbzcListingTiles,
  parseDbzcPrintedNumber,
  parseDbzcollectionListing,
  dbzcGroupingCandidates,
} from "./parseDbzcollection";

const FIXTURE = `
<div class="bc_cadre_numero" title="Regular"><div class="bc_texte_numero">Album</div></div>
<img src="packagings/94/353/h100_298_packaging.jpg" />
<div class="bc_cadre_numero" title="Regular"><div class="bc_texte_numero">Booster</div></div>
<img src="packagings/94/353/h100_299_packaging.jpg" />
<a name="c20679"></a>
<div class="bc_cadre_numero" title="Regular"><div class="bc_texte_numero">1</div></div>
<img id="img_20679" src="cartes/94/353/h100_20679_carte.jpg" />
<div class="bc_cadre_numero" title="Silver"><div class="bc_texte_numero">8</div></div>
<img id="img_20869" src="cartes/94/353/h100_20869_carte.jpg" />
<div class="bc_cadre_numero" title="Gold"><div class="bc_texte_numero">6</div></div>
<img id="img_31799" src="cartes/94/465/h100_31799_carte.jpg" />
`;

const IT_TILE_FIXTURE = `
<div title="Regular"><div>x</div>
<img id="img_16179" src="cartes/74/304/h100_16179_carte.jpg" />
</div>
<div title="Silver">
<img id="img_16334" src="cartes/74/305/h100_16334_carte.jpg" />
</div>
`;

describe("parseDbzcollectionListing", () => {
  it("parses cards with rarity + packaging SKUs", () => {
    const parsed = parseDbzcollectionListing(FIXTURE);
    expect(parsed.cards).toEqual([
      {
        printed: "1",
        number: "0001",
        grouping: null,
        rarityLabel: null,
        cardId: "20679",
        thumbPath: "cartes/94/353/h100_20679_carte.jpg",
        facePath: "cartes/94/353/h400_20679_carte.jpg",
      },
      {
        printed: "6",
        number: "0006",
        grouping: "g",
        rarityLabel: "Gold",
        cardId: "31799",
        thumbPath: "cartes/94/465/h100_31799_carte.jpg",
        facePath: "cartes/94/465/h400_31799_carte.jpg",
      },
      {
        printed: "8",
        number: "0008",
        grouping: "s",
        rarityLabel: "Silver",
        cardId: "20869",
        thumbPath: "cartes/94/353/h100_20869_carte.jpg",
        facePath: "cartes/94/353/h400_20869_carte.jpg",
      },
    ]);
    expect(parsed.packs).toEqual([
      {
        label: "Album",
        packId: "298",
        thumbPath: "packagings/94/353/h100_298_packaging.jpg",
        facePath: "packagings/94/353/h400_298_packaging.jpg",
      },
      {
        label: "Booster",
        packId: "299",
        thumbPath: "packagings/94/353/h100_299_packaging.jpg",
        facePath: "packagings/94/353/h400_299_packaging.jpg",
      },
    ]);
  });
});

describe("parseDbzcListingTiles", () => {
  it("reads IT/ES tiles without printed numbers", () => {
    expect(parseDbzcListingTiles(IT_TILE_FIXTURE)).toEqual([
      {
        grouping: null,
        rarityLabel: null,
        cardId: "16179",
        thumbPath: "cartes/74/304/h100_16179_carte.jpg",
        facePath: "cartes/74/304/h400_16179_carte.jpg",
      },
      {
        grouping: "s",
        rarityLabel: "Silver",
        cardId: "16334",
        thumbPath: "cartes/74/305/h100_16334_carte.jpg",
        facePath: "cartes/74/305/h400_16334_carte.jpg",
      },
    ]);
  });
});

describe("parseDbzcCardInfo", () => {
  it("reads Nom from AJAX detail table", () => {
    const html = `
      <table class="apercu_table">
        <tr>
          <td class="apercu_td_intitule" valign="top">Nom :</td>
          <td class="apercu_td_valeur" valign="top">Sangoku SSJ</td>
        </tr>
      </table>`;
    expect(parseDbzcCardInfo(html)).toMatchObject({ name: "Sangoku SSJ" });
  });

  it("decodes HTML entities in Nom", () => {
    const html = `
      <td class="apercu_td_intitule">Nom :</td>
      <td class="apercu_td_valeur">Caf&eacute;</td>`;
    expect(parseDbzcCardInfo(html)).toMatchObject({ name: "Café" });
  });

  it("parses n° / S / G printed numbers", () => {
    const html = `
      <td class="apercu_td_intitule" valign="top">Num&eacute;ro :</td>
      <td class="apercu_td_valeur" valign="top">n&deg; 1</td>
      <td class="apercu_td_intitule" valign="top">Raret&eacute; :</td>
      <td class="apercu_td_valeur" valign="top">Regular</td>
      <td class="apercu_td_intitule" valign="top">Nom :</td>
      <td class="apercu_td_valeur" valign="top">Goku</td>`;
    expect(parseDbzcCardInfo(html)).toEqual({
      name: "Goku",
      printed: "1",
      printedRaw: "n° 1",
      grouping: null,
      rarityLabel: null,
    });
  });
});

describe("parseDbzcPrintedNumber", () => {
  it.each([
    ["n° 1", { printed: "1", grouping: null }],
    ["S5", { printed: "5", grouping: "s" }],
    ["G7", { printed: "7", grouping: "g" }],
    ["65", { printed: "65", grouping: null }],
  ])("%s", (raw, expected) => {
    expect(parseDbzcPrintedNumber(raw)).toEqual(expected);
  });
});

describe("dbzcGroupingCandidates", () => {
  it("tries metalsil for Silver parallels", () => {
    expect(dbzcGroupingCandidates("s", "Silver")).toEqual([
      "s",
      "metalsil",
      "argento",
    ]);
  });
});
