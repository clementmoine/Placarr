import { describe, expect, it } from "vitest";

import {
  artSlotIsLandscape,
  mergeArtFaceOrientation,
  orientationFromIndexSlot,
  printIsLandscapeCard,
  resolveArtFaceOrientation,
} from "./artFaceOrientation";

describe("resolveArtFaceOrientation", () => {
  it("cadre paysage sans rotation quand le scan est déjà large", () => {
    expect(resolveArtFaceOrientation(1500, 1068)).toEqual({
      landscapeFace: true,
    });
  });

  it("tourne un scan portrait d'un tirage paysage", () => {
    expect(
      resolveArtFaceOrientation(245, 328, { printIsLandscape: true }),
    ).toEqual({ faceQuarterTurns: 1 });
  });

  it("laisse un scan portrait d'un tirage portrait", () => {
    expect(resolveArtFaceOrientation(600, 840)).toEqual({});
    expect(
      resolveArtFaceOrientation(600, 840, { printIsLandscape: false }),
    ).toEqual({});
  });
});

describe("printIsLandscapeCard", () => {
  it("déduit le tirage paysage d'un scan Coleka FR", () => {
    const entry = {
      set: "nr",
      card: "0068",
      langs: {
        fr: { art: "art.coleka.webp", artW: 746, artH: 523 },
        it: { art: "art.imadoki.jpg", artW: 245, artH: 328 },
      },
    };
    expect(printIsLandscapeCard(entry)).toBe(true);
    expect(orientationFromIndexSlot(entry, entry.langs.it)).toEqual({
      faceQuarterTurns: 1,
    });
    expect(orientationFromIndexSlot(entry, entry.langs.fr)).toEqual({
      landscapeFace: true,
    });
  });

  it("ignore les slots sans dimensions", () => {
    expect(artSlotIsLandscape({ artW: 100, artH: 200 })).toBe(false);
    expect(artSlotIsLandscape({ artW: 200, artH: 100 })).toBe(true);
  });

  it("fusionne les hints serveur avec les pixels chargés", () => {
    expect(
      mergeArtFaceOrientation(
        { landscapePrint: true },
        245,
        328,
      ),
    ).toEqual({ faceQuarterTurns: 1 });
    expect(mergeArtFaceOrientation({}, 1500, 1068)).toEqual({
      landscapeFace: true,
    });
  });
});
