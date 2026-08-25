import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  colekaCarddassFrLedgerPath,
  loadColekaCarddassFrLedger,
} from "./scrapeColekaCarddassFr";

describe("loadColekaCarddassFrLedger", () => {
  it("reads staging/coleka-carddass-fr under the pack root", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-fr-"));
    const dest = colekaCarddassFrLedgerPath(packDir);
    expect(dest).toBe(
      path.join(packDir, "staging", "coleka-carddass-fr", "cards.json"),
    );
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "ni001",
            cardType: "ni",
            set: "s1",
            colekaRef: "NI-01",
            name: "Naruto Uzumaki",
            colekaId: "202417",
            pagePath: "/fr/x",
            thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
            faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
          },
        ],
      }),
      "utf8",
    );
    expect(loadColekaCarddassFrLedger(packDir).map((c) => c.number)).toEqual([
      "ni001",
    ]);
  });
});
