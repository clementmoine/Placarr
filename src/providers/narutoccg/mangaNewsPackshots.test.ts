import { describe, expect, it } from "vitest";

import {
  mangaNewsFullGoodieUrl,
  mangaNewsIngestPackshots,
  mangaNewsPackshotLedger,
} from "./mangaNewsPackshots";

describe("Manga-News booster packshots", () => {
  it("turns the dotted _medium listing thumb into the full goodie", () => {
    expect(
      mangaNewsFullGoodieUrl(
        "https://www.manga-news.com/public/images/goodies/.tcg-naruto-deck-serie-4_medium.jpg",
      ),
    ).toBe(
      "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-4.jpg",
    );
    expect(
      mangaNewsFullGoodieUrl(
        "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg",
      ),
    ).toBe(
      "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg",
    );
  });

  it("maps Deck Série 1–5 covers to FR boosters, not starters or Sage's Legacy", () => {
    const ledger = mangaNewsPackshotLedger();
    expect(mangaNewsIngestPackshots().map((row) => row.slug)).toEqual([
      "booster-s1",
      "booster-s2",
      "booster-s3",
      "booster-s4",
      "booster-s5",
    ]);
    expect(ledger.page).toContain("/collection/TCG-Naruto");
    expect(ledger.skip.map((row) => row.setCode)).toEqual(["s24"]);
    expect(ledger.skip[0]?.ingest).toBe(false);
    expect(ledger.products.every((row) => !row.url.includes("_medium"))).toBe(
      true,
    );
  });
});
