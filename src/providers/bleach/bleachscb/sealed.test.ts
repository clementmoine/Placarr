import { describe, expect, it } from "vitest";

import {
  BLEACH_SCB_CURATED_ART,
  bleachScbPressPackshotLedger,
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
});
