import { describe, expect, it } from "vitest";

import {
  goatCdnOriginal,
  goatIngestPackshots,
  goatMintDisplayPackshots,
  goatPackshotLedger,
} from "./goatPackshots";

describe("Goat EN display packshots", () => {
  it("drops /medium/ from listing thumbs", () => {
    expect(
      goatCdnOriginal(
        "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/medium/broken_promise.jpg",
      ),
    ).toBe(
      "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
    );
    expect(
      goatCdnOriginal(
        "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
      ),
    ).toBe(
      "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
    );
  });

  it("archives every CDN display-box as art.goat — Coleka gaps only mint SKUs", () => {
    const rows = goatIngestPackshots();
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.map((row) => row.setCode)).toContain("s1");
    expect(rows.map((row) => row.setCode)).toContain("s12");
    expect(rows.map((row) => row.setCode)).toContain("s16");
    expect(rows.every((row) => row.slug === `display-${row.setCode}`)).toBe(
      true,
    );
    expect(
      rows.every((row) => row.staging.startsWith("staging/goat-en-boxes/")),
    ).toBe(true);
    expect(rows.find((row) => row.setCode === "s16")?.staging).toBe(
      "staging/goat-en-boxes/s16.gif",
    );
    expect(rows.find((row) => row.setCode === "s16")?.title).toBe(
      "Broken Promises",
    );

    const minted = goatMintDisplayPackshots();
    expect(minted.map((row) => row.setCode)).toEqual([
      "s16",
      "s19",
      "s21",
      "s22",
      "s23",
      "s27",
    ]);
    expect(minted.some((row) => /^s[1-6]$/.test(row.setCode))).toBe(false);

    const ledger = goatPackshotLedger();
    expect(ledger.sealed.boosterBoxes.packshots.ingest).toBe("all-cdn-displays");
    expect(ledger.ingest).toBe("faces");
    expect(
      ledger.sealed.boosterBoxes.products.filter(
        (row) => row.kind === "jp-box",
      ),
    ).toHaveLength(2);
  });
});
