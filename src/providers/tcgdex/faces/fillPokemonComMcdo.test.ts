import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  fillPokemonComMcdoCampaign,
  pokemonComMcdoImageUrl,
} from "./fillPokemonComMcdo";

describe("pokemonComMcdoImageUrl", () => {
  it("pads nn in the Happy Meal tile path", () => {
    expect(
      pokemonComMcdoImageUrl(
        "https://mcdn.example/base",
        "cms2/img/misc/_tiles/happy-meal/2023/inline/full/{nn}-en.png",
        4,
      ),
    ).toBe(
      "https://mcdn.example/base/cms2/img/misc/_tiles/happy-meal/2023/inline/full/04-en.png",
    );
  });
});

describe("fillPokemonComMcdoCampaign", () => {
  it("writes art.pokemoncom.png and prefers it over tcgplayer", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "poke-pcom-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(600).fill(1)]);
    const report = await fillPokemonComMcdoCampaign({
      baseUrl: "https://mcdn.example/base",
      campaign: {
        id: "test",
        setId: "2023sv",
        lang: "en",
        cardCount: 2,
        pathTemplate: "happy/{nn}-en.png",
      },
      cardsRoot: root,
      downloadImage: async (url) => {
        expect(url).toMatch(/happy\/0[12]-en\.png$/);
        return png;
      },
    });
    expect(report.written).toBe(2);
    expect(report.failed).toBe(0);
    const cardDir = path.join(root, "2023sv", "en", "001");
    expect(existsSync(path.join(cardDir, "art.pokemoncom.png"))).toBe(true);
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, "face.json"), "utf8"),
    ) as { art: string };
    expect(decision.art).toBe("art.pokemoncom.png");
  });
});
