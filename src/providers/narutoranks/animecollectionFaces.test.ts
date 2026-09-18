import { describe, expect, it } from "vitest";

import {
  parseAnimeCollectionRanksBackImageId,
  parseAnimeCollectionRanksFaces,
  ranksSetForAcPrinted,
  ranksSetForAcPrintedLabel,
} from "./animecollectionFaces";

describe("ranksSetForAcPrintedLabel", () => {
  it("maps base grid 1–72 to nr", () => {
    expect(ranksSetForAcPrinted(1)).toEqual({ set: "nr", number: "0001" });
    expect(ranksSetForAcPrinted(72)).toEqual({ set: "nr", number: "0072" });
    expect(ranksSetForAcPrinted(73)).toBeNull();
  });

  it("maps insert labels including GS → bl", () => {
    expect(ranksSetForAcPrintedLabel("FF6")).toEqual({
      set: "ff",
      number: "0006",
    });
    expect(ranksSetForAcPrintedLabel("NW9")).toEqual({
      set: "nw",
      number: "0009",
    });
    expect(ranksSetForAcPrintedLabel("SD1")).toEqual({
      set: "sd",
      number: "0001",
    });
    expect(ranksSetForAcPrintedLabel("NS3")).toEqual({
      set: "ns",
      number: "0003",
    });
    expect(ranksSetForAcPrintedLabel("GS2")).toEqual({
      set: "bl",
      number: "0002",
    });
  });
});

describe("parseAnimeCollectionRanksFaces", () => {
  it("reads numbered tiles and inserts", () => {
    const html = `
      <div class="bc_texte_numero">12</div>
      <img onclick="afficher_detail('9912','87/200/h400_9912');" src="h100_9912_carte.jpg">
      <div class="bc_texte_numero">12</div>
      <img onclick="afficher_detail('9912','87/200/h400_9912');" src="h100_9912_carte.jpg">
      <div class="bc_texte_numero">FF6</div>
      <img onclick="afficher_detail('7916','87/200/h400_7916');" src="h100_7916_carte.jpg">
      <div class="bc_texte_numero">GS1</div>
      <img onclick="afficher_detail('7938','87/200/h400_7938');" src="h100_7938_carte.jpg">
      <div class="bc_texte_numero">Booster Box</div>
      <img onclick="afficher_detail_pack('342','87/200/h400_342');">
    `;
    expect(parseAnimeCollectionRanksFaces(html)).toEqual([
      { printed: "GS1", set: "bl", number: "0001", acId: "7938" },
      { printed: "FF6", set: "ff", number: "0006", acId: "7916" },
      { printed: "12", set: "nr", number: "0012", acId: "9912" },
    ]);
  });
});

describe("parseAnimeCollectionRanksBackImageId", () => {
  it("reads Dos de la carte image id", () => {
    const html = `
      <div class="bc_texte_numero">Dos de la carte</div>
      <img onclick="masquer_detail(); afficher_detail_img('440','87/200/7916/h400_440','7916');"
           src="cartes/87/200/7916/h100_440_carte_image.jpg" />
    `;
    expect(parseAnimeCollectionRanksBackImageId(html)).toBe("440");
  });
});
