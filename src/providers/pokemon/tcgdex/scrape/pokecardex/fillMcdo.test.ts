import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pokemonFaceSourceOf, pickBestPokemonFace } from "../../disk/faceChoice";
import { fillPokecardexMcdoCampaign } from "./fillMcdo";

describe("fillPokecardexMcdoCampaign", () => {
  it("writes art.pokecardex.jpg and prefers it over coleka", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pcdx-mcdo-"));
    const seen: string[] = [];
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
        return Buffer.from(`scan:${url}`);
      },
    });

    expect(report.written).toBe(2);
    expect(report.failed).toBe(0);
    expect(seen[0]).toContain("/sets/M23/FR/1.jpg?class=original");
    expect(seen[1]).toContain("/sets/M23/FR/2.jpg?class=original");

    const cardDir = path.join(root, "2023sv", "fr", "001");
    expect(existsSync(path.join(cardDir, "art.pokecardex.jpg"))).toBe(true);
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "photo");
    expect(
      pickBestPokemonFace(
        [
          { source: "coleka", width: 0, height: 0 },
          { source: "pokecardex", width: 0, height: 0 },
        ],
        "fr",
      ),
    ).toBe("pokecardex");
    expect(pokemonFaceSourceOf("art.pokecardex.jpg")).toBe("pokecardex");

    const decision = JSON.parse(
      readFileSync(path.join(cardDir, "face.json"), "utf8"),
    ) as { art: string };
    expect(decision.art).toBe("art.pokecardex.jpg");
  });
});
