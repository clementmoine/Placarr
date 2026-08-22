import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { narutoRanksEffectPack } from "@/effects/narutoranks";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { narutoranksModule } from "./index";
import { narutoRanksCuratedDir } from "./pack";

describe("narutoranks provider hooks", () => {
  it("declares the card-database surface of the local catalogue", () => {
    expect(narutoranksModule.info.id).toBe("narutoranks");
    expect(narutoranksModule.catalog?.dataPack).toBe("naruto/ninja-ranks");
    expect(narutoranksModule.searchPrints).toBeTypeOf("function");
    expect(narutoranksModule.lookupPrint).toBeTypeOf("function");
    expect(narutoranksModule.info.nameDatabase).toBe(true);
    expect(narutoranksModule.printGames).toEqual(["naruto"]);
  });

  it("does not claim a Carddass or 疾風伝 print", async () => {
    await expect(
      narutoranksModule.lookupPrint!({ printKey: "naruto:ni-0001" }),
    ).resolves.toBeNull();
    await expect(
      narutoranksModule.lookupPrint!({ printKey: "naruto:shi-0001" }),
    ).resolves.toBeNull();
    await expect(
      narutoranksModule.lookupPrint!({ printKey: "lorcana:6-48" }),
    ).resolves.toBeNull();
  });

  it("exposes search and print-key handlers", () => {
    expect(Object.keys(narutoranksModule.testHandlers ?? {})).toEqual([
      "narutoranks-search",
      "narutoranks-printkey",
    ]);
  });
});

describe("verso curé de Ninja Ranks", () => {
  const curated = narutoRanksCuratedDir();

  it("does not ship a made-up back", () => {
    expect(
      listCuratedBackSources(path.join(curated, "cards")).map(
        (row) => row.destRel,
      ),
    ).toEqual([]);
  });

  it("declares the filename the effect pack will look for", () => {
    expect(narutoRanksEffectPack.cardBackUrl).toBe(
      "/assets/naruto/ninja-ranks/cards/back.fr.webp",
    );
  });

  it("documents that the verso is still missing", () => {
    expect(existsSync(path.join(curated, "BACK.md"))).toBe(true);
  });

  it("keeps the tree to sources + the note, nothing staged", () => {
    expect(
      readdirSync(curated)
        .filter((name) => !name.startsWith("."))
        .sort(),
    ).toEqual(["BACK.md", "products", "sources"]);
  });
});
