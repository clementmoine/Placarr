import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  colekaStorm3LedgerPath,
  loadColekaStorm3Ledger,
} from "./scrapeColekaStorm3";

describe("loadColekaStorm3Ledger", () => {
  it("reads staging/coleka-s28 under the pack root (not nested twice)", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-s28-"));
    const dest = colekaStorm3LedgerPath(packDir);
    expect(dest).toBe(
      path.join(packDir, "staging", "coleka-s28", "cards.json"),
    );
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "n1650",
            cardType: "n",
            colekaRef: "NI-1650",
            name: "Kisame Hoshigaki",
            colekaId: "819630",
            pagePath: "/fr/cartes-naruto-serie-28/kisame-hoshigaki_i819630",
            thumbUrl:
              "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650_250x250.webp",
            faceUrl:
              "https://thumbs.coleka.com/media/item/202102/10/cartes-naruto-serie-28-kisame-hoshigaki-ni-1650.webp",
          },
        ],
      }),
      "utf8",
    );
    expect(loadColekaStorm3Ledger(packDir).map((c) => c.number)).toEqual([
      "n1650",
    ]);
  });
});
