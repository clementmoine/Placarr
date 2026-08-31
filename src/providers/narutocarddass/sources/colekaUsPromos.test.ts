import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  colekaUsPromoLedgerPath,
  loadColekaUsPromoLedger,
  mergeColekaUsPromosIntoIndex,
} from "./colekaUsPromos";

describe("loadColekaUsPromoLedger", () => {
  it("reads staging/coleka-us-promos under the pack root", () => {
    const packDir = mkdtempSync(
      path.join(tmpdir(), "naruto-coleka-us-promos-"),
    );
    const dest = colekaUsPromoLedgerPath(packDir);
    expect(dest).toBe(
      path.join(packDir, "staging", "coleka-us-promos", "cards.json"),
    );
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "pr0001",
            cardType: "pr",
            colekaRef: "PR-001",
            name: "Naruto Uzumaki",
            colekaId: "1624573",
            pagePath: "/fr/x_i1624573",
            thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
            faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
          },
        ],
      }),
      "utf8",
    );
    expect(loadColekaUsPromoLedger(packDir).map((c) => c.number)).toEqual([
      "pr0001",
    ]);
  });
});

describe("mergeColekaUsPromosIntoIndex", () => {
  it("adds missing promo prints and English titles without inventing a French name", () => {
    const packDir = mkdtempSync(path.join(tmpdir(), "naruto-us-promo-merge-"));
    const dest = colekaUsPromoLedgerPath(packDir);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      JSON.stringify({
        cards: [
          {
            number: "pr0005-R",
            cardType: "pr",
            colekaRef: "PR-005R",
            name: "Naruto Uzumaki",
            colekaId: "1",
            pagePath: "/x",
            thumbUrl: "https://thumbs.coleka.com/media/item/x_250x250.webp",
            faceUrl: "https://thumbs.coleka.com/media/item/x.webp",
          },
          {
            number: "pr0096",
            cardType: "pr",
            colekaRef: "PR-096",
            name: "The 4 th Hokage",
            colekaId: "2",
            pagePath: "/y",
            thumbUrl: "https://thumbs.coleka.com/media/item/y_250x250.webp",
            faceUrl: "https://thumbs.coleka.com/media/item/y.webp",
          },
        ],
      }),
      "utf8",
    );
    const merged = mergeColekaUsPromosIntoIndex({
      prints: [
        {
          printKey: "naruto:pr-0096",
          setCode: "promo",
          number: "pr0096",
          cardType: "pr",
          family: "promo",
        },
      ],
      titles: [
        { printKey: "naruto:pr-0096", lang: "fr", fullName: "4E Hokage" },
      ],
      root: packDir,
    });
    expect(merged.prints).toHaveLength(2);
    expect(merged.addedPrints).toEqual(["naruto:pr-0005-r"]);
    expect(merged.titled).toEqual(["naruto:pr-0005-r", "naruto:pr-0096"]);
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:pr-0096" && t.lang === "en",
      )?.fullName,
    ).toBe("The 4 th Hokage");
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:pr-0096" && t.lang === "fr",
      )?.fullName,
    ).toBe("4E Hokage");
    expect(
      merged.titles.some(
        (t) => t.printKey === "naruto:pr-0005-r" && t.lang === "fr",
      ),
    ).toBe(false);
  });
});
