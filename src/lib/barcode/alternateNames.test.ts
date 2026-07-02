import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    barcodeCache: {
      findUnique: h.findUnique,
    },
  },
}));

import {
  expandBarcodeAlternateNames,
  loadBarcodeAlternateNames,
} from "@/lib/barcode/alternateNames";

beforeEach(() => {
  h.findUnique.mockReset();
});

describe("expandBarcodeAlternateNames", () => {
  it("strips trailing platform suffixes and dedupes", () => {
    expect(
      expandBarcodeAlternateNames([
        "GoldenEye: Rogue Agent",
        "GoldenEye : Au Service du Mal PS2",
      ]),
    ).toEqual(
      expect.arrayContaining([
        "GoldenEye: Rogue Agent",
        "GoldenEye : Au Service du Mal PS2",
        "GoldenEye : Au Service du Mal",
      ]),
    );
  });
});

describe("loadBarcodeAlternateNames", () => {
  it("returns expanded raw names from barcode cache", async () => {
    h.findUnique.mockResolvedValue({
      rawNames: [{ value: "Zapper: One Wicked Cricket!" }],
    });

    await expect(loadBarcodeAlternateNames("3546430103593")).resolves.toEqual([
      "Zapper: One Wicked Cricket!",
    ]);
  });

  it("returns empty list when barcode is missing", async () => {
    await expect(loadBarcodeAlternateNames(null)).resolves.toEqual([]);
    expect(h.findUnique).not.toHaveBeenCalled();
  });
});
