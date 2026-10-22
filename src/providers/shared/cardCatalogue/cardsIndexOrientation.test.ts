/**
 * artOrientationForPackPrint — nullish lang must not throw (LEFT JOIN titles).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { persistCardsIndexDoc } from "@/providers/shared/cardCatalogue/cardsIndexDoc";

import {
  artOrientationForPackPrint,
  resetCardsIndexOrientationCache,
} from "./cardsIndexOrientation";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
  resetCardsIndexOrientationCache();
});

function writePackIndex(
  packId: string,
  cards: CardsIndexV1["cards"],
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cards-orient-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  fs.mkdirSync(path.join(root, packId), { recursive: true });
  persistCardsIndexDoc(packId, {
    version: 1,
    pack: packId,
    cards,
  });
  return packId;
}

describe("artOrientationForPackPrint", () => {
  it("survives a null lang from a print with no title yet", () => {
    const packId = writePackIndex("naruto/carddass", {
      "naruto:ni-0001": {
        set: "ninja",
        card: "ni-0001",
        langs: {
          fr: { art: "art.jpg", artW: 500, artH: 700 },
        },
      },
    });
    resetCardsIndexOrientationCache();

    expect(
      artOrientationForPackPrint(packId, "naruto:ni-0001", null),
    ).toBeNull();
    expect(
      artOrientationForPackPrint(packId, "naruto:ni-0001", undefined),
    ).toBeNull();
  });

  it("still resolves landscapePrint when lang is missing", () => {
    const packId = writePackIndex("naruto/carddass", {
      "naruto:ni-0099": {
        set: "ninja",
        card: "ni-0099",
        landscapePrint: true,
        langs: {
          fr: { art: "art.jpg", artW: 700, artH: 500 },
        },
      },
    });
    resetCardsIndexOrientationCache();

    expect(
      artOrientationForPackPrint(packId, "naruto:ni-0099", null),
    ).toEqual({ landscapeFace: true, landscapePrint: true });
  });

  it("rotates a portrait locale when sibling langs are landscape", () => {
    const packId = writePackIndex("naruto/ninja-ranks", {
      "naruto:nr-0068": {
        set: "nr",
        card: "0068",
        landscapePrint: true,
        langs: {
          fr: { art: "art.fr.webp", artW: 1040, artH: 736 },
          en: { art: "art.en.jpg", artW: 300, artH: 212 },
          it: { art: "art.it.jpg", artW: 236, artH: 328 },
        },
      },
    });
    resetCardsIndexOrientationCache();

    expect(
      artOrientationForPackPrint(packId, "naruto:nr-0068", "fr"),
    ).toEqual({ landscapeFace: true, landscapePrint: true });
    expect(
      artOrientationForPackPrint(packId, "naruto:nr-0068", "it"),
    ).toEqual({ faceQuarterTurns: 1, landscapePrint: true });
  });

  it("assumes a quarter-turn when a landscape print has no dims for this lang", () => {
    const packId = writePackIndex("naruto/ninja-ranks", {
      "naruto:nr-0067": {
        set: "nr",
        card: "0067",
        landscapePrint: true,
        langs: {
          fr: { art: "art.fr.webp", artW: 1040, artH: 736 },
          it: { art: "art.it.jpg" },
        },
      },
    });
    resetCardsIndexOrientationCache();

    expect(
      artOrientationForPackPrint(packId, "naruto:nr-0067", "it"),
    ).toEqual({ faceQuarterTurns: 1, landscapePrint: true });
  });
});
