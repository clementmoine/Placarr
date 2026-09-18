import { describe, expect, it } from "vitest";

import {
  normalizeOfficialPrinted,
  parseBattleCardCsv,
  parseCrossCardlistHtml,
  parseFormationCardlistHtml,
  parseMissionCardlistHtml,
} from "./parseOfficialCardlists";

describe("parseOfficialCardlists", () => {
  it("normalise NF001 et DN-032T", () => {
    expect(normalizeOfficialPrinted("NF001")).toBe("NF-001");
    expect(normalizeOfficialPrinted("DN-032T")).toBe("DN-032T");
    expect(normalizeOfficialPrinted("DN-051-R")).toBe("DN-051R");
    expect(normalizeOfficialPrinted("DN-051R")).toBe("DN-051R");
  });

  it("lit le CSV battle_card", () => {
    const csv = [
      "収録,カードNo,カード名,奥義名",
      "1弾,DN-001T,うずまきナルト,忍術 影分身の術",
      "promo,DNP-001,はたけカカシ,写輪眼",
    ].join("\n");
    expect(parseBattleCardCsv(csv)).toEqual([
      { printed: "DN-001T", nameJa: "うずまきナルト" },
      { printed: "DNP-001", nameJa: "はたけカカシ" },
    ]);
  });

  it("lit une ligne Mission NM", () => {
    const html = `
      <td rowspan="5" bgcolor="#006DB8" class="s_font_wb" nowrap>NM-049</td>
      <td rowspan="3" bgcolor="#EEFFFF" nowrap><strong><a href="javascript:;">うちはイタチ</a></strong></td>
    `;
    expect(parseMissionCardlistHtml(html)).toEqual([
      { printed: "NM-049", nameJa: "うちはイタチ" },
    ]);
  });

  it("lit une ligne Formation NF sans tiret", () => {
    const html = `
      <td rowspan="4" nowrap="nowrap" class="cardNum s_font_b">NF141</td>
      <td rowspan="4" nowrap="nowrap" class="m_font_b"><a href="javascript:;">うちはイタチ<br>(疾風伝)</a></td>
    `;
    expect(parseFormationCardlistHtml(html)).toEqual([
      { printed: "NF-141", nameJa: "うちはイタチ" },
    ]);
  });

  it("lit une ligne Cross NX / NXP / NXpf", () => {
    const html = `
      <td rowspan="3" class="card_name_num">NX-002</td>
      <td nowrap="nowrap" class="card_name_num"><a href="javascript:;">うずまきナルト</a></td>
      <td rowspan="3" class="card_name_num">NXpf-001</td>
      <td nowrap="nowrap" class="card_name_num"><a href="javascript:;">うずまきナルト</a></td>
    `;
    expect(parseCrossCardlistHtml(html)).toEqual([
      { printed: "NX-002", nameJa: "うずまきナルト" },
      { printed: "NXPF-001", nameJa: "うずまきナルト" },
    ]);
  });
});
