import { describe, expect, it } from "vitest";

import {
  mergeArtFaceOrientation,
  orientationFromIndexSlot,
  orientationFromLenticularGrid,
  resolveArtFaceOrientation,
} from "@/lib/text/artFaceOrientation";

describe("resolveArtFaceOrientation", () => {
  it("does not rotate a portrait scan unless the print is landscape", () => {
    expect(resolveArtFaceOrientation(320, 450)).toEqual({});
    expect(resolveArtFaceOrientation(320, 450, { printIsLandscape: true })).toEqual(
      { faceQuarterTurns: 1 },
    );
  });

  it("frames a landscape scan wide without rotation", () => {
    expect(resolveArtFaceOrientation(450, 320)).toEqual({ landscapeFace: true });
  });
});

describe("orientationFromIndexSlot", () => {
  it("ignores a stale landscapePrint when the measured face is portrait", () => {
    // After enrich, portrait faces must not keep landscapePrint — but if a
    // caller still passes a bad flag, orientationFromIndexSlot would rotate.
    // Catalogue truth is: flag cleared when pixels are portrait.
    const entry = {
      set: "t2w3",
      card: "nr.mr.016",
      landscapePrint: undefined as true | undefined,
      langs: { en: { art: "art.webp", artW: 320, artH: 450 } },
    };
    expect(orientationFromIndexSlot(entry, entry.langs.en)).toEqual({});
  });

  it("frames Kayou 1×2 lenticular panels as landscape without rotating the strip", () => {
    const entry = {
      set: "smritiheavenscrolls1",
      card: "nrss.hr.008",
      lenticularGrid: { cols: 1, rows: 2 },
      langs: { en: { art: "art.webp", artW: 320, artH: 450 } },
    };
    expect(orientationFromIndexSlot(entry, entry.langs.en)).toEqual({
      landscapeFace: true,
    });
    expect(
      mergeArtFaceOrientation({ landscapeFace: true }, 320, 450),
    ).toEqual({ landscapeFace: true });
  });
});

describe("orientationFromLenticularGrid", () => {
  it("marks stacked landscape panels wide and leaves 2×2 portrait quadrants upright", () => {
    expect(orientationFromLenticularGrid(320, 450, { cols: 1, rows: 2 })).toEqual({
      landscapeFace: true,
    });
    expect(orientationFromLenticularGrid(320, 450, { cols: 1, rows: 3 })).toEqual({
      landscapeFace: true,
    });
    expect(orientationFromLenticularGrid(320, 450, { cols: 2, rows: 2 })).toEqual({
      landscapeFace: true,
    });
  });

  it("uses attested per-panel crops when provided", () => {
    expect(
      orientationFromLenticularGrid(320, 450, { cols: 2, rows: 2 }, [
        { left: 20, top: 88, right: 6, bottom: 10, shiftY: -20 },
        { left: 6, top: 88, right: 20, bottom: 10, shiftY: -20 },
        { left: 20, top: 5, right: 6, bottom: 62, shiftY: 32 },
        { left: 6, top: 5, right: 20, bottom: 62, shiftY: 32 },
      ]),
    ).toEqual({});
  });
});
