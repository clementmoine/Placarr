/**
 * artOrientationForPackPrint — nullish lang must not throw (LEFT JOIN titles).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  cards: Record<string, unknown>,
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cards-orient-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  const packDir = path.join(root, packId);
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "cards-index.json"),
    JSON.stringify({ version: 1, pack: packId, cards }),
  );
  return packId;
}

describe("artOrientationForPackPrint", () => {
  it("survives a null lang from a print with no title yet", () => {
    const packId = writePackIndex("naruto/carddass", {
      "naruto:ni-0001": {
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
});
