import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { bleachScbCuratedDir } from "../pack";
import {
  buildBleachFrLedger,
  parseBleachCarddassFrPromoFile,
} from "./carddassFr";

describe("bleachscb parseCarddassFr", () => {
  it("parses exclusive and dual Promo filenames", () => {
    expect(parseBleachCarddassFrPromoFile("Promo-1.gif")).toEqual({
      file: "Promo-1.gif",
      numbers: ["001"],
      exclusive: true,
    });
    expect(parseBleachCarddassFrPromoFile("Promo-15-16.gif")).toEqual({
      file: "Promo-15-16.gif",
      numbers: ["015", "016"],
      exclusive: false,
    });
    expect(parseBleachCarddassFrPromoFile("Promo-10.gif")?.numbers).toEqual([
      "010",
    ]);
    expect(parseBleachCarddassFrPromoFile("A001l.jpg")).toBeNull();
  });

  it("builds FR ledger from Wayback scout + liste HTML when present", () => {
    const { cards, promos } = buildBleachFrLedger();
    // Wayback scout lives under curated/sources/wayback.
    expect(cards.length).toBeGreaterThan(50);
    const a001 = cards.find((c) => c.printed === "A001");
    expect(a001?.faceUrlFr).toMatch(/web\.archive\.org/);
    expect(a001?.nameFr).toMatch(/Ichigo/i);
    expect(a001?.set).toBe("a");

    const p015 = cards.find((c) => c.printed === "P015");
    expect(p015?.faceUrlFr).toMatch(/Promo-15\.gif/i);
    expect(p015?.faceUrlFr).not.toMatch(/Promo-15-16/i);
    const p016 = cards.find((c) => c.printed === "P016");
    expect(p016?.faceUrlFr).toMatch(/Promo-16\.gif/i);

    expect(promos.assets.length).toBeGreaterThanOrEqual(12);
    const dual = promos.assets.find((a) => a.file === "Promo-15-16.gif");
    expect(dual?.exclusive).toBe(false);
    expect(dual?.localRel).toMatch(/promos\/Promo-15-16\.gif$/);
    const exclusive15 = promos.assets.find((a) => a.file === "Promo-15.gif");
    expect(exclusive15?.exclusive).toBe(true);
    expect(exclusive15?.localRel).toMatch(/promos\/Promo-15\.gif$/);
    expect(
      existsSync(
        path.join(bleachScbCuratedDir(), "sources", "wayback", "promos", "Promo-1.gif"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          bleachScbCuratedDir(),
          "sources",
          "wayback",
          "promos",
          "Promo-15.gif",
        ),
      ),
    ).toBe(true);
  });
});
