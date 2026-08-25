import { describe, expect, it } from "vitest";

import {
  goatCdnOriginal,
  goatIngestPackshots,
  goatPackshotLedger,
} from "./goatPackshots";

describe("Goat Coleka-gap display packshots", () => {
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

  it("ingests only the six Coleka-missing displays, never s1–s6", () => {
    const rows = goatIngestPackshots();
    expect(rows.map((row) => row.setCode)).toEqual([
      "s16",
      "s19",
      "s21",
      "s22",
      "s23",
      "s27",
    ]);
    expect(rows.map((row) => row.slug)).toEqual([
      "display-s16",
      "display-s19",
      "display-s21",
      "display-s22",
      "display-s23",
      "display-s27",
    ]);
    expect(rows.find((row) => row.setCode === "s16")?.title).toBe(
      "Broken Promises",
    );
    expect(rows.find((row) => row.setCode === "s16")?.staging).toBe(
      "staging/goat-en-boxes/s16.gif",
    );
    expect(
      rows.every((row) => row.staging.startsWith("staging/goat-en-boxes/")),
    ).toBe(true);
    expect(rows.some((row) => /^s[1-6]$/.test(row.setCode))).toBe(false);
    const ledger = goatPackshotLedger();
    expect(ledger.sealed.boosterBoxes.packshots.ingest).toBe("coleka-gaps");
    expect(ledger.ingest).toBe("faces");
    expect(
      ledger.sealed.boosterBoxes.products.filter(
        (row) => row.kind === "jp-box",
      ),
    ).toHaveLength(2);
  });
});
