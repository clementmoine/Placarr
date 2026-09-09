import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  fillTcgplayerFacesForSet,
  tcgplayerIdFromCardPayload,
  tcgplayerProductImageUrl,
} from "./fillTcgplayer";
import {
  POKEMONTCG_MCDO_STEMS,
  pokemontcgIoMcdoImageUrl,
} from "./fillPokemontcgIo";

describe("tcgplayerProductImageUrl", () => {
  it("builds the 1000px CDN URL", () => {
    expect(tcgplayerProductImageUrl(516515)).toBe(
      "https://product-images.tcgplayer.com/fit-in/1000x1000/516515.jpg",
    );
  });
});

describe("tcgplayerIdFromCardPayload", () => {
  it("reads the first variants_detailed tcgplayer id", () => {
    expect(
      tcgplayerIdFromCardPayload({
        variants_detailed: [{ thirdParty: { tcgplayer: 516515 } }],
      }),
    ).toBe(516515);
    expect(tcgplayerIdFromCardPayload({})).toBeNull();
  });
});

describe("fillTcgplayerFacesForSet", () => {
  it("writes art.tcgplayer.jpg for 2023sv-4 en", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-tcgp-"));
    const jpeg = Buffer.alloc(600, 1);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;

    const report = await fillTcgplayerFacesForSet({
      setId: "2023sv",
      localIds: ["4"],
      lang: "en",
      cardsRoot: path.join(root, "cards"),
      fetchCard: async () => ({
        variants_detailed: [{ thirdParty: { tcgplayer: 516515 } }],
      }),
      downloadImage: async () => jpeg,
    });

    expect(report.written).toBe(1);
    const dest = path.join(
      root,
      "cards",
      "2023sv",
      "en",
      "004",
      "art.tcgplayer.jpg",
    );
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).byteLength).toBe(600);
  });
});

describe("pokemontcgIoMcdoImageUrl", () => {
  it("maps known stems and skips 2023", () => {
    expect(POKEMONTCG_MCDO_STEMS["2022swsh"]).toBe("mcd22");
    expect(POKEMONTCG_MCDO_STEMS["2023sv"]).toBeUndefined();
    expect(pokemontcgIoMcdoImageUrl("mcd22", "4")).toBe(
      "https://images.pokemontcg.io/mcd22/4_hires.png",
    );
  });
});
