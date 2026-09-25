import { describe, expect, it } from "vitest";

import {
  dbzcAbsoluteUrl,
  dbzcCardInfoUrl,
  dbzcPackInfoUrl,
  dbzcSetListingUrl,
  decodeDbzcEntities,
  parseDbzcCardDetail,
  parseDbzcollectionListing,
  parseDbzcPackDetail,
} from "./dbzcollection";
import { assignCardGroupings } from "../scrape/dbzcollection";
import {
  dbsjccPrintKey,
  dbsjccSetLabel,
  formatDbsjccReference,
  normalizeGrouping,
  parseDbsjccNumber,
} from "../printKey";

describe("printKey", () => {
  it("normalizes printed card numbers", () => {
    expect(parseDbsjccNumber("D-1")).toBe("d0001");
    expect(parseDbsjccNumber("D-51")).toBe("d0051");
    expect(parseDbsjccNumber("D-123")).toBe("d0123");
    expect(parseDbsjccNumber("D-938")).toBe("d0938");
    expect(parseDbsjccNumber("SP-01")).toBe("sp0001");
    expect(parseDbsjccNumber("SP-25")).toBe("sp0025");
    expect(parseDbsjccNumber("invalid")).toBeNull();
  });

  it("normalizes variant grouping slugs", () => {
    expect(normalizeGrouping("Monde de Kaio")).toBe("mondedekaio");
    expect(normalizeGrouping("Enfer")).toBe("enfer");
    expect(normalizeGrouping("PA 1000")).toBe("pa1000");
    expect(normalizeGrouping("NC 7")).toBe("nc7");
  });

  it("builds valid printKeys without and with grouping", () => {
    expect(dbsjccPrintKey("part1", "D-1")).toBe("dbsjcc:part1-d0001");
    expect(dbsjccPrintKey("part4", "D-431", "kaio")).toBe(
      "dbsjcc:part4-d0431-kaio",
    );
    expect(dbsjccPrintKey("sp", "SP-25")).toBe("dbsjcc:sp-sp0025");
  });

  it("formats reference strings nicely", () => {
    expect(dbsjccSetLabel("part1")).toBe("Part 1");
    expect(formatDbsjccReference("part1", "D-1", "Commune")).toBe(
      "Part 1 D-1 (Commune)",
    );
    expect(
      formatDbsjccReference("part4", "D-431", "Commune", "Monde de kaio"),
    ).toBe("Part 4 D-431 (Monde de kaio, Commune)");
  });
});

describe("parseDbzcollection", () => {
  it("decodes HTML entities properly", () => {
    expect(decodeDbzcEntities("Cartes &Agrave; Jouer")).toBe(
      "Cartes À Jouer",
    );
    expect(decodeDbzcEntities("S&eacute;rie")).toBe("Série");
    expect(decodeDbzcEntities("Mal&eacute;fique")).toBe("Maléfique");
    expect(decodeDbzcEntities("Ka&iuml;o")).toBe("Kaïo");
  });

  it("generates correct URLs", () => {
    expect(dbzcSetListingUrl("1")).toBe(
      "http://www.dbzcollection.fr/2v2/cartes.php?idc=1&ids=1",
    );
    expect(dbzcCardInfoUrl("51")).toBe(
      "http://www.dbzcollection.fr/2v2/traitements_ajax/get_infos_detail_carte.php?id=51",
    );
    expect(dbzcPackInfoUrl("1188")).toBe(
      "http://www.dbzcollection.fr/2v2/traitements_ajax/get_infos_detail_pack.php?id=1188",
    );
    expect(dbzcAbsoluteUrl("cartes/1/1/h100_51_carte.jpg")).toBe(
      "http://www.dbzcollection.fr/2v2/cartes/1/1/h100_51_carte.jpg",
    );
  });

  it("parses cards and packs from listing HTML", () => {
    const snippet = `
      <td class="bloc_carte"><a name="c1188"></a>
      <div class="bc_cadre">
        <div class="bc_cadre_numero" title="Regular" style="background:transparent url(images/titres_cartes/regular.jpg) repeat-x;"><div class="bc_texte_numero">Booster</div></div>
        <div class="bc_cadre_carte"><table cellspacing="0" cellpadding="0" width="100%" height="100%" border="0"><tr><td class="bc_zone_carte">
          <div align="center" class="cadre_carte2">
            <table cellspacing="0" cellpadding="0" border="0" class="table_carte"><tr><td class="cadre_carte1"><img id="img_pack_1188" onclick="afficher_detail_pack('1188','1/1/h400_1188');" src="packagings/1/1/h100_1188_packaging.jpg" border="0" class="cadre_carte" /></td></tr></table>	
          </div>
        </td></tr></table></div>
      </div>
      </td>
      <td class="bloc_carte"><a name="c51"></a>
      <div class="bc_cadre" style="padding-bottom:1px;">
        <div class="bc_cadre_numero" title="Commune" style="background:transparent url(images/titres_cartes/orange.jpg) repeat-x;"><div class="bc_texte_numero">D-1</div></div>
        <div class="bc_cadre_carte"><table cellspacing="0" cellpadding="0" width="100%" height="100%" border="0"><tr><td class="bc_zone_carte">
          <div align="center" class="cadre_carte2">
            <table cellspacing="0" cellpadding="0" border="0" class="table_carte"><tr><td class="cadre_carte1"><img id="img_51" onclick="afficher_detail('51','1/1/h400_51');" src="cartes/1/1/h100_51_carte.jpg" border="0" class="cadre_carte" /></td></tr></table>
          </div>
        </td></tr></table></div>
      </div>
      </td>
    `;
    const parsed = parseDbzcollectionListing(snippet);
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0]!.cardId).toBe("51");
    expect(parsed.cards[0]!.printed).toBe("D-1");
    expect(parsed.cards[0]!.rarityTile).toBe("Commune");
    expect(parsed.cards[0]!.thumbPath).toBe("cartes/1/1/h100_51_carte.jpg");
    expect(parsed.cards[0]!.facePath).toBe("cartes/1/1/h400_51_carte.jpg");
    expect(parsed.cards[0]!.hdFacePath).toBe("cartes/1/1/h3000_51_carte.jpg");

    expect(parsed.packs).toHaveLength(1);
    expect(parsed.packs[0]!.packId).toBe("1188");
    expect(parsed.packs[0]!.label).toBe("Booster");
    expect(parsed.packs[0]!.thumbPath).toBe("packagings/1/1/h100_1188_packaging.jpg");
    expect(parsed.packs[0]!.facePath).toBe("packagings/1/1/h400_1188_packaging.jpg");
  });

  it("parses card details from Ajax table", () => {
    const ajaxHtml = `
      <table cellspacing="0" cellpadding="0" border="0" class="apercu_table">
        <tr>
          <td class="apercu_td_intitule" valign="top">Collection :</td>
          <td class="apercu_td_valeur" valign="top">Cartes &Agrave; Jouer Et &Agrave; Collectionner JCC fr</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">S&eacute;rie :</td>
          <td class="apercu_td_valeur" valign="top">Part 4</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Num&eacute;ro :</td>
          <td class="apercu_td_valeur" valign="top">D-431</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Raret&eacute; :</td>
          <td class="apercu_td_valeur" valign="top">Commune</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Nom :</td>
          <td class="apercu_td_valeur" valign="top">Buu</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Prix d'appel : <br />Energie/Cout : </td>
          <td class="apercu_td_valeur" valign="top">3</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Caracteristiques :</td>
          <td class="apercu_td_valeur" valign="top">Homme du mal</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Pouvoir cach&eacute; :</td>
          <td class="apercu_td_valeur" valign="top">Monde de kaio</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Nature :<br />Couleur : </td>
          <td class="apercu_td_valeur" valign="top">Mal&eacute;fique</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Autres infos :</td>
          <td class="apercu_td_valeur" valign="top">Booster</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Version HD :</td>
          <td class="apercu_td_valeur" valign="top"><a href="cartes/1/14/h3000_499_carte.jpg" target="_blank">Cliquez ici pour t&eacute;l&eacute;charger la version HD de cette carte</a></td>
        </tr>
      </table>
    `;
    const detail = parseDbzcCardDetail(ajaxHtml, "499");
    expect(detail.name).toBe("Buu");
    expect(detail.printed).toBe("D-431");
    expect(detail.rarity).toBe("Commune");
    expect(detail.cost).toBe("3");
    expect(detail.characteristics).toBe("Homme du mal");
    expect(detail.pouvoirCache).toBe("Monde de kaio");
    expect(detail.nature).toBe("Maléfique");
    expect(detail.hdPath).toBe("cartes/1/14/h3000_499_carte.jpg");
  });

  it("parses packaging details from Ajax table", () => {
    const packHtml = `
      <table cellspacing="0" cellpadding="0" border="0" class="apercu_table">
        <tr>
          <td class="apercu_td_intitule" valign="top">S&eacute;rie :</td>
          <td class="apercu_td_valeur" valign="top">Part 1</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Nom :</td>
          <td class="apercu_td_valeur" valign="top">Booster</td>
        </tr>
        <tr>
          <td class="apercu_td_intitule" valign="top">Version HD :</td>
          <td class="apercu_td_valeur" valign="top"><a href="packagings/1/1/h3000_1188_packaging.jpg" target="_blank">Cliquez ici pour t&eacute;l&eacute;charger la version HD de ce packaging</a></td>
        </tr>
      </table>
    `;
    const pack = parseDbzcPackDetail(packHtml, "1188");
    expect(pack.serie).toBe("Part 1");
    expect(pack.name).toBe("Booster");
    expect(pack.hdPath).toBe("packagings/1/1/h3000_1188_packaging.jpg");
  });

  it("assigns unique grouping to duplicate card numbers based on power or rarity", () => {
    const cards = [
      {
        cardId: "51",
        printed: "D-1",
        rarityTile: "Commune",
        thumbPath: "",
        facePath: "",
        hdFacePath: "",
        detail: {
          cardId: "51",
          collection: null,
          serie: "Part 1",
          printed: "D-1",
          rarity: "Commune",
          name: "Goku",
          cost: null,
          characteristics: null,
          powerCost: null,
          power: null,
          pouvoirCache: null,
          nature: null,
          otherInfo: null,
          hdPath: null,
        },
      },
      {
        cardId: "499",
        printed: "D-431",
        rarityTile: "Commune",
        thumbPath: "",
        facePath: "",
        hdFacePath: "",
        detail: {
          cardId: "499",
          collection: null,
          serie: "Part 4",
          printed: "D-431",
          rarity: "Commune",
          name: "Buu",
          cost: null,
          characteristics: null,
          powerCost: null,
          power: null,
          pouvoirCache: "Monde de kaio",
          nature: null,
          otherInfo: null,
          hdPath: null,
        },
      },
      {
        cardId: "500",
        printed: "D-431 ",
        rarityTile: "Commune",
        thumbPath: "",
        facePath: "",
        hdFacePath: "",
        detail: {
          cardId: "500",
          collection: null,
          serie: "Part 4",
          printed: "D-431 ",
          rarity: "Commune",
          name: "Buu",
          cost: null,
          characteristics: null,
          powerCost: null,
          power: null,
          pouvoirCache: "Enfer",
          nature: null,
          otherInfo: null,
          hdPath: null,
        },
      },
    ];

    const groupings = assignCardGroupings(cards);
    expect(groupings.get("51")).toBeNull();
    expect(groupings.get("499")).toBe("kaio");
    expect(groupings.get("500")).toBe("enfer");
  });
});
