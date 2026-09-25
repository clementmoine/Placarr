/**
 * Carddass club (sec.carddass.com) — official SDBH product ledger.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dbhCuratedDir } from "./pack";

type ClubProduct = {
  jan: string;
  title: string;
  released?: string | null;
  cardsPerPack?: number | null;
  declaredCardCount?: number | null;
  images?: string[];
};

describe("dbh carddass club ledger", () => {
  it("lists official SDBH products with JAN + title (packshots often absent)", () => {
    const raw = JSON.parse(
      readFileSync(
        join(dbhCuratedDir(), "sources", "carddass-official-products.json"),
        "utf8",
      ),
    ) as { count: number; products: ClubProduct[]; url: string };

    expect(raw.url).toContain("sec.carddass.com/club/products");
    expect(raw.count).toBeGreaterThanOrEqual(80);
    expect(raw.products.length).toBe(raw.count);

    const bravery = raw.products.find((p) => p.title.includes("激突する武勇"));
    expect(bravery?.jan).toBe("4549660401124000");
    expect(bravery?.cardsPerPack).toBe(3);
    expect(bravery?.declaredCardCount).toBe(30);
    expect(bravery?.released).toBe("2019-08");

    // Mission waves are attested even when gallery is card collage / cabinet.
    const bmt12 = raw.products.find((p) =>
      p.title.includes("ビッグバンミッション12弾"),
    );
    expect(bmt12?.jan).toBeTruthy();
    expect(bmt12?.released).toBe("2022-01");

    for (const p of raw.products) {
      expect(p.jan).toMatch(/^\d{10,16}$/);
      expect(p.title.length).toBeGreaterThan(5);
    }
  });
});
