import { describe, expect, it } from "vitest";

import { planSeriesSiblingBarcodeAttaches } from "./seriesSiblingBarcodes";

describe("planSeriesSiblingBarcodeAttaches", () => {
  it("attache l'EAN unique du même volume aux siblings sans barcode", () => {
    expect(
      planSeriesSiblingBarcodeAttaches({
        seedTitle: "Naruto Tome 3",
        shelfItems: [
          { id: "t1", title: "Naruto Tome 1", barcode: null },
          { id: "t2", title: "Naruto Tome 2", barcode: "9782871294177" },
          { id: "t3", title: "Naruto Tome 3", barcode: "9782871294276" },
          { id: "t4", title: "Naruto Tome 4", barcode: null },
        ],
        catalogVolumes: [
          {
            volume: "1",
            barcode: "9782871294146",
            title: "Naruto, tome 1",
          },
          {
            volume: "2",
            barcode: "9782871294177",
            title: "Naruto, tome 2",
          },
          {
            volume: "3",
            barcode: "9782871294276",
            title: "Naruto - Tome 3",
          },
          {
            volume: "4",
            barcode: "9782871294412",
            title: "Naruto - Tome 4",
          },
        ],
      }),
    ).toEqual([
      { itemId: "t1", barcode: "9782871294146", volume: "1" },
      { itemId: "t4", barcode: "9782871294412", volume: "4" },
    ]);
  });

  it("n'attache rien si le volume shelf est ambigu ou déjà barcode", () => {
    expect(
      planSeriesSiblingBarcodeAttaches({
        seedTitle: "Naruto Tome 1",
        shelfItems: [
          { id: "a", title: "Naruto Tome 1", barcode: "9782871294146" },
          { id: "b", title: "Naruto Tome 2", barcode: null },
          { id: "c", title: "Naruto n°2", barcode: null },
        ],
        catalogVolumes: [
          { volume: "1", barcode: "9782871294146", title: "Naruto 1" },
          { volume: "2", barcode: "9782871294177", title: "Naruto 2" },
        ],
      }),
    ).toEqual([]);
  });
});
