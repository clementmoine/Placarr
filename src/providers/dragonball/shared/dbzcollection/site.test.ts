import { describe, expect, it } from "vitest";

import {
  DBZC_ORIGIN,
  dbzcAbsoluteUrl,
  dbzcCardInfoUrl,
  dbzcPackInfoUrl,
  dbzcSetListingUrl,
  decodeDbzcEntities,
  decodeDbzcHtmlBytes,
  extractDbzcTableField,
} from "./site";

describe("dbzcollection site", () => {
  it("builds listing and ajax URLs from collection idc", () => {
    expect(dbzcSetListingUrl("1", "1")).toBe(
      `${DBZC_ORIGIN}/cartes.php?idc=1&ids=1`,
    );
    expect(dbzcSetListingUrl("353", "94")).toBe(
      `${DBZC_ORIGIN}/cartes.php?idc=94&ids=353`,
    );
    expect(dbzcCardInfoUrl("51")).toBe(
      `${DBZC_ORIGIN}/traitements_ajax/get_infos_detail_carte.php?id=51`,
    );
    expect(dbzcPackInfoUrl("1188")).toBe(
      `${DBZC_ORIGIN}/traitements_ajax/get_infos_detail_pack.php?id=1188`,
    );
    expect(dbzcAbsoluteUrl("cartes/1/1/h100_51_carte.jpg")).toBe(
      `${DBZC_ORIGIN}/cartes/1/1/h100_51_carte.jpg`,
    );
  });

  it("decodes the entities both collections print", () => {
    expect(decodeDbzcEntities("Cartes &Agrave; Jouer")).toBe("Cartes À Jouer");
    expect(decodeDbzcEntities("Caf&eacute;")).toBe("Café");
    expect(decodeDbzcEntities("Ka&iuml;o")).toBe("Kaïo");
    expect(decodeDbzcEntities("Le v&oelig;u d'Upa")).toBe("Le vœu d'Upa");
    expect(decodeDbzcEntities("gr&acirc;ce")).toBe("grâce");
  });

  it("decodes latin-1 listing bytes (Détecteur) without U+FFFD", () => {
    const latin1 = Buffer.from("D\xe9tecteur", "binary");
    expect(decodeDbzcHtmlBytes(latin1)).toBe("Détecteur");
    expect(decodeDbzcHtmlBytes(Buffer.from("Détecteur", "utf8"))).toBe(
      "Détecteur",
    );
  });

  it("reads AJAX table fields", () => {
    const html = `
      <td class="apercu_td_intitule">Nom :</td>
      <td class="apercu_td_valeur">Sangoku SSJ</td>`;
    expect(extractDbzcTableField(html, "Nom")).toBe("Sangoku SSJ");
  });
});
