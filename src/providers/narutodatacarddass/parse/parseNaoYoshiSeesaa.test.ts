import { describe, expect, it } from "vitest";

import {
  looksLikeMojibakeJa,
  mergeNaoYoshiSeesaaRows,
  normalizeNaoYoshiRarity,
  parseNaoYoshiSeesaaArticle,
} from "./parseNaoYoshiSeesaa";

const NX_SNIPPET = `
<table>
<tr><th>NO.</th><th>カード名</th><th>レア</th><th>start</th><th>データ</th><th>CheckDigit</th><th>stop</th></tr>
<tr><td>NX-001</td><td>うずまきナルト</td><td>N</td><td>A</td><td>NX5VC3336</td><td>FF</td><td>stop</td></tr>
<tr><td>NX-002</td><td>うずまきナルト</td><td>SR</td><td>A</td><td>NX2CZ5D89</td><td>SHIFT</td><td>stop</td></tr>
<tr><td>NX-108</td><td>うちはサスケ</td><td>激</td><td>A</td><td>NX9AB4Y86</td><td>GS</td><td>stop</td></tr>
<tr><td>NX-MAC001</td><td>うずまきナルト</td><td>-</td><td>A</td><td>NF0LB7400</td><td>D</td><td>stop</td></tr>
<tr><td colspan="7">noise NXSKZQ65P barcode only</td></tr>
</table>
`;

const DN_SNIPPET = `
<table>
<tr><th>種</th><th>NO.</th><th>カード名</th><th>レア</th><th>start</th><th>データ</th><th>CheckDigit</th><th>stop</th></tr>
<tr><td>-</td><td>DN-001T</td><td>うずまきナルト</td><td>Ｎ</td><td>A</td><td>NR5AH0016</td><td>U</td><td>stop</td></tr>
<tr><td>-</td><td>DN-002T,DNP-001</td><td>うずまきナルト</td><td>Ｎ</td><td>A</td><td>NR0AS0041</td><td>BS</td><td>stop</td></tr>
<tr><td>-</td><td>DN-108T</td><td>うずまきナルト</td><td>爆</td><td>A</td><td>NR9AB4Y86</td><td>GS</td><td>stop</td></tr>
</table>
`;

describe("parseNaoYoshiSeesaa", () => {
  it("normalizes rarity glyphs", () => {
    expect(normalizeNaoYoshiRarity("Ｎ")).toBe("N");
    expect(normalizeNaoYoshiRarity("Ｒ")).toBe("R");
    expect(normalizeNaoYoshiRarity("激")).toBe("激レア");
    expect(normalizeNaoYoshiRarity("爆")).toBe("爆レア");
    expect(normalizeNaoYoshiRarity("-")).toBeNull();
    expect(normalizeNaoYoshiRarity("stop")).toBeNull();
  });

  it("detects mojibake Japanese titles", () => {
    expect(looksLikeMojibakeJa("うずまきナルト")).toBe(false);
    expect(looksLikeMojibakeJa("縺�★縺ｾ縺阪リ")).toBe(true);
    expect(looksLikeMojibakeJa("broken�name")).toBe(true);
  });

  it("parses NX article rows without treating barcodes as printed refs", () => {
    const rows = parseNaoYoshiSeesaaArticle(NX_SNIPPET, {
      articleId: "387083772",
      cabinet: "nx",
    });
    expect(rows.map((r) => r.printed)).toEqual([
      "NX-001",
      "NX-002",
      "NX-108",
      "NX-MAC001",
    ]);
    expect(rows.find((r) => r.printed === "NX-002")?.rarity).toBe("SR");
    expect(rows.find((r) => r.printed === "NX-108")?.rarity).toBe("激レア");
    expect(rows.find((r) => r.printed === "NX-MAC001")?.rarity).toBeNull();
    expect(rows.find((r) => r.printed === "NX-001")?.barcodeData).toBe(
      "NX5VC3336",
    );
  });

  it("parses DN rows including comma-joined printed refs", () => {
    const rows = parseNaoYoshiSeesaaArticle(DN_SNIPPET, {
      articleId: "387082531",
      cabinet: "dn",
    });
    expect(rows.map((r) => r.printed)).toEqual([
      "DN-001T",
      "DN-002T",
      "DNP-001",
      "DN-108T",
    ]);
    expect(rows.find((r) => r.printed === "DN-001T")?.rarity).toBe("N");
    expect(rows.find((r) => r.printed === "DN-108T")?.rarity).toBe("爆レア");
  });

  it("merges duplicate printed refs preferring richer rows", () => {
    const merged = mergeNaoYoshiSeesaaRows([
      {
        printed: "NX-001",
        nameJa: "うずまきナルト",
        rarity: null,
        barcodeData: null,
        cabinet: "nx",
        articleId: "a",
      },
      {
        printed: "NX-001",
        nameJa: "うずまきナルト",
        rarity: "N",
        barcodeData: "NX5VC3336",
        cabinet: "nx",
        articleId: "b",
      },
    ]);
    expect(merged.get("NX-001")?.rarity).toBe("N");
    expect(merged.get("NX-001")?.barcodeData).toBe("NX5VC3336");
  });
});
