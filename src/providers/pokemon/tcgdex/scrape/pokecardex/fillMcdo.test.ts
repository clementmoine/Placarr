import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pokemonFaceSourceOf, pickBestPokemonFace } from "../../disk/faceChoice";
import { fillPokecardexMcdoCampaign } from "./fillMcdo";

describe("fillPokecardexMcdoCampaign", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  it("writes art.pokecardex.jpg and prefers it over coleka", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pcdx-mcdo-"));
    const seen: string[] = [];
    const { default: sharp } = await import("sharp");
    const catalogScan = await sharp(PNG_1X1).resize(400, 560).jpeg().toBuffer();
    const report = await fillPokecardexMcdoCampaign({
      campaign: {
        id: "m23-fr",
        seriesCode: "M23",
        setId: "2023sv",
        lang: "fr",
        zone: "FR",
        cardCount: 2,
      },
      cardsRoot: root,
      downloadImage: async (url) => {
        seen.push(url);
        return catalogScan;
      },
    });

    expect(report.written).toBe(2);
    expect(report.failed).toBe(0);
    expect(seen[0]).toContain("/sets/M23/FR/1.jpg?class=original");
    expect(seen[1]).toContain("/sets/M23/FR/2.jpg?class=original");

    const cardDir = path.join(root, "fr", "2023sv", "001");
    expect(existsSync(path.join(cardDir, "art.pokecardex.jpg"))).toBe(true);
    writeFileSync(
      path.join(cardDir, "art.coleka.webp"),
      await sharp(PNG_1X1).resize(800, 1120).webp().toBuffer(),
    );
    // Catalog pokecardex beats larger coleka listing_photo (same as harvest).
    expect(
      pickBestPokemonFace(
        [
          { source: "coleka", width: 800, height: 1120 },
          { source: "pokecardex", width: 400, height: 560 },
        ],
        "fr",
      ),
    ).toBe("pokecardex");
    expect(pokemonFaceSourceOf("art.pokecardex.jpg")).toBe("pokecardex");

    // Re-rank now that coleka also sits on disk — catalog still wins.
    const { refreshPokemonFaceDecision, resolvePokemonArtFilename } =
      await import("../../disk/faceChoice");
    expect(refreshPokemonFaceDecision(cardDir, "fr")).toBe(
      "art.pokecardex.jpg",
    );
    expect(resolvePokemonArtFilename(cardDir, "fr")).toBe(
      "art.pokecardex.jpg",
    );
  });
});
