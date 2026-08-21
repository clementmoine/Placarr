import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { narutoUltraEffectPack } from "@/effects/narutoultra";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { narutoultraModule } from "./index";
import { narutoUltraCuratedDir } from "./pack";

describe("narutoultra provider hooks", () => {
  it("declares the card-database surface of an empty local catalogue", () => {
    expect(narutoultraModule.info.id).toBe("narutoultra");
    expect(narutoultraModule.catalog?.dataPack).toBe("naruto/ultra-challenge");
    expect(narutoultraModule.searchPrints).toBeTypeOf("function");
    expect(narutoultraModule.lookupPrint).toBeTypeOf("function");
    expect(narutoultraModule.info.nameDatabase).toBe(true);
    expect(narutoultraModule.printGames).toEqual(["naruto"]);
  });

  it("does not claim a Carddass, 疾風伝, or Ninja Ranks print", async () => {
    await expect(
      narutoultraModule.lookupPrint!({ printKey: "naruto:ni-0001" }),
    ).resolves.toBeNull();
    await expect(
      narutoultraModule.lookupPrint!({ printKey: "naruto:shi-0001" }),
    ).resolves.toBeNull();
    await expect(
      narutoultraModule.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
  });

  it("exposes search and print-key handlers", () => {
    expect(Object.keys(narutoultraModule.testHandlers ?? {})).toEqual([
      "narutoultra-search",
      "narutoultra-printkey",
    ]);
  });
});

describe("verso curé d'Ultra Challenge", () => {
  const curated = narutoUltraCuratedDir();

  it("does not ship a made-up back", () => {
    expect(
      listCuratedBackSources(path.join(curated, "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual([]);
  });

  it("declares the filename the effect pack will look for", () => {
    expect(narutoUltraEffectPack.cardBackUrl).toBe(
      "/assets/naruto/ultra-challenge/cards/back.fr.webp",
    );
  });

  it("documents that the verso is still missing", () => {
    expect(existsSync(path.join(curated, "BACK.md"))).toBe(true);
  });

  it("keeps the tree to sources, reconstructed products, and the note", () => {
    expect(
      readdirSync(curated)
        .filter((name) => !name.startsWith("."))
        .sort(),
    ).toEqual(["BACK.md", "products", "sources"]);
    expect(
      existsSync(
        path.join(
          curated,
          "products",
          "booster",
          "fr",
          "art.reconstructed.png",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          curated,
          "products",
          "collector-album",
          "fr",
          "back.reconstructed.png",
        ),
      ),
    ).toBe(true);
  });
});
