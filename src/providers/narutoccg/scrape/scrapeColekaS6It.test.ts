import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  colekaS6ItLedgerPath,
  loadColekaS6ItLedger,
  mergeColekaS6ItIntoIndex,
} from "./scrapeColekaS6It";

describe("loadColekaS6ItLedger", () => {
  it("reads staging/coleka-s6-it under the pack root", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-s6-it-"));
    const dest = colekaS6ItLedgerPath(packDir);
    expect(dest).toBe(
      path.join(packDir, "staging", "coleka-s6-it", "cards.json"),
    );
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "ta226",
            cardType: "ta",
            colekaRef: "TA-226",
            printedRef: "ST-226",
            name: "Potere del segno maledetto",
            colekaId: "1761843",
            pagePath: "/fr/cartes-naruto-serie-06/potere_i1761843",
            thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
            faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
          },
          {
            number: "cl032",
            cardType: "cl",
            colekaRef: "CL-32",
            printedRef: "CL-32",
            name: null,
            colekaId: "1761802",
            pagePath: "/fr/cartes-naruto-serie-06/carte-cl-32_i1761802",
            thumbUrl: null,
            faceUrl: null,
          },
        ],
      }),
      "utf8",
    );
    expect(loadColekaS6ItLedger(packDir).map((c) => c.number)).toEqual([
      "ta226",
      "cl032",
    ]);
  });
});

describe("mergeColekaS6ItIntoIndex", () => {
  it("adds s6 prints and Italian titles without inventing a French name", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-s6-it-merge-"));
    const dest = colekaS6ItLedgerPath(packDir);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "ta226",
            cardType: "ta",
            colekaRef: "TA-226",
            printedRef: "ST-226",
            name: "Potere del segno maledetto",
            colekaId: "1",
            pagePath: "/x",
            thumbUrl: null,
            faceUrl: null,
          },
          {
            number: "cl032",
            cardType: "cl",
            colekaRef: "CL-32",
            printedRef: "CL-32",
            name: null,
            colekaId: "2",
            pagePath: "/y",
            thumbUrl: null,
            faceUrl: null,
          },
        ],
      }),
      "utf8",
    );
    const merged = mergeColekaS6ItIntoIndex({
      prints: [],
      titles: [],
      root: packDir,
    });
    expect(merged.addedPrints).toEqual(["naruto:cl-0032", "naruto:ta-0226"]);
    expect(merged.titles).toEqual([
      {
        printKey: "naruto:ta-0226",
        lang: "it",
        fullName: "Potere del segno maledetto",
        rarity: null,
      },
    ]);
    expect(merged.prints.map((p) => p.number)).toEqual(["cl0032", "ta0226"]);
  });
});
