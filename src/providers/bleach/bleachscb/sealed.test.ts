import { describe, expect, it } from "vitest";

import {
  BLEACH_SCB_CURATED_ART,
  bleachFrS1BoosterPoolPrintKeys,
  bleachScbPressPackshotLedger,
  buildBleachScbProductsContents,
} from "./sealed";

describe("bleachscb sealed press packshots", () => {
  it("keeps Ultrajeux display distinct from Temps Libre booster (same EAN trap)", () => {
    const ledger = bleachScbPressPackshotLedger();
    const boosterFace = ledger.products.find(
      (row) =>
        row.slug === "booster-s1-shinigami-and-ichigo" && row.face === true,
    );
    const display = ledger.products.find(
      (row) => row.slug === "display-s1-shinigami-and-ichigo",
    );
    expect(boosterFace?.host).toBe("tempslibre");
    expect(boosterFace?.kind).toBe("booster");
    expect(display?.host).toBe("ultrajeux");
    expect(display?.kind).toBe("display");
    expect(display?.ean).toBe(boosterFace?.ean);
  });

  it("maps curated faces to retail hosts without dropping carddass dumps", () => {
    expect(BLEACH_SCB_CURATED_ART["starter-compagnons"]).toMatchObject({
      primary: "compagnons_catalogue.gif",
      source: "carddass-fr",
    });
    expect(BLEACH_SCB_CURATED_ART["starter-compagnons"]?.extras).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "adilsons" }),
        expect.objectContaining({ source: "ultrajeux" }),
      ]),
    );
    expect(BLEACH_SCB_CURATED_ART["booster-s1-shinigami-and-ichigo"]).toMatchObject({
      primary: "booster_s1_tempslibre.jpg",
      source: "tempslibre",
    });
    expect(
      BLEACH_SCB_CURATED_ART["booster-s1-shinigami-and-ichigo"]?.extras,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "carddass-fr" }),
      ]),
    );
    expect(BLEACH_SCB_CURATED_ART["starter-rivaux"]).toMatchObject({
      primary: "rivaux_ultrajeux.jpg",
      source: "ultrajeux",
    });
    expect(BLEACH_SCB_CURATED_ART["display-s1-shinigami-and-ichigo"]).toMatchObject({
      primary: "display_s1_ultrajeux.jpg",
      source: "ultrajeux",
    });
  });

  it("lists FR S1 booster pool from carddass ledger (not JA set s)", () => {
    const keys = bleachFrS1BoosterPoolPrintKeys();
    expect(keys.length).toBeGreaterThanOrEqual(60);
    expect(keys.every((k) => k.startsWith("bleachscb:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("bleachscb:a-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("bleachscb:s-"))).toBe(false);
    expect(keys.some((k) => k.startsWith("bleachscb:p-"))).toBe(false);

    const contents = buildBleachScbProductsContents();
    const booster = contents.skus["booster-s1-shinigami-and-ichigo"];
    expect(booster?.randomPoolScope).toBe("listed");
    expect(booster?.randomPoolPrintKeys).toEqual(keys);
    const display = contents.skus["display-s1-shinigami-and-ichigo"];
    expect(display?.randomPoolScope).toBe("none");
    expect(display?.packsContained).toBe(24);
    expect(display?.guaranteedProducts?.[0]?.slug).toBe(
      "booster-s1-shinigami-and-ichigo",
    );
    expect(contents.byKind.display?.packsContained).toBe(24);
  });
});
