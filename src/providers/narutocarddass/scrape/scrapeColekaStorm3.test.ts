import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  colekaSagesLegacyLedgerPath,
  colekaStorm3LedgerPath,
  loadColekaSagesLegacyLedger,
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

describe("loadColekaSagesLegacyLedger", () => {
  it("reads staging/coleka-s24 under the pack root (not nested twice)", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-coleka-s24-"));
    const dest = colekaSagesLegacyLedgerPath(packDir);
    expect(dest).toBe(
      path.join(packDir, "staging", "coleka-s24", "cards.json"),
    );
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "j895",
            cardType: "j",
            colekaRef: "JU-895",
            name: "Scellage des Démons à Queues",
            colekaId: "788802",
            pagePath:
              "/fr/cartes-naruto-serie-24-sage-s-legacy/scellage-des-demons-a-queues_i788802",
            thumbUrl:
              "https://thumbs.coleka.com/media/item/202010/16/cartes-naruto-serie-24-sage-s-legacy-scellage-des-demons-a-queues_250x250.webp",
            faceUrl:
              "https://thumbs.coleka.com/media/item/202010/16/cartes-naruto-serie-24-sage-s-legacy-scellage-des-demons-a-queues.webp",
          },
        ],
      }),
      "utf8",
    );
    expect(loadColekaSagesLegacyLedger(packDir).map((c) => c.number)).toEqual([
      "j895",
    ]);
  });
});
