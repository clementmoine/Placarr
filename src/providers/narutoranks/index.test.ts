import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { narutoRanksEffectPack } from "@/effects/narutoranks";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";
import { enrichCardsIndexArtDimensions } from "@/providers/shared/cardCatalogue/enrichCardsIndexArtDimensions";
import { resetCardsIndexOrientationCache } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";

import { narutoranksModule } from "./index";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

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

  it("déduit paysage / rotation depuis les dimensions du scan", async () => {
    await enrichCardsIndexArtDimensions(NARUTO_RANKS_PACK_ID);
    resetCardsIndexOrientationCache();

    const kakashi = await narutoranksModule.lookupPrint!({
      printKey: "naruto:ns-0001",
    });
    expect(kakashi?.landscapeFace).toBe(true);

    const rookies = await narutoranksModule.lookupPrint!({
      printKey: "naruto:nr-0067",
      language: "fr",
    });
    expect(rookies?.landscapeFace).toBe(true);

    const trio = await narutoranksModule.lookupPrint!({
      printKey: "naruto:nr-0069",
      language: "fr",
    });
    expect(trio?.landscapeFace).toBe(true);

    const eight = await narutoranksModule.lookupPrint!({
      printKey: "naruto:nr-0068",
      language: "fr",
    });
    expect(eight?.landscapeFace).toBe(true);

    const rookiesIt = await narutoranksModule.lookupPrint!({
      printKey: "naruto:nr-0067",
      language: "it",
    });
    expect(rookiesIt?.faceQuarterTurns).toBe(1);
    expect(rookiesIt?.landscapePrint).toBe(true);

    const ten = await narutoranksModule.lookupPrint!({
      printKey: "naruto:nr-0010",
    });
    expect(ten?.landscapeFace).toBeFalsy();
    expect(ten?.faceQuarterTurns).toBeFalsy();
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

  // `cards/` porte les scans curés (faces reconstruites, versos) — c'est
  // l'arbre que lit `installReconstructedFaces`. Ce qui reste interdit, c'est
  // du staging de scrape sous `curated/`.
  it("keeps the tree to sources, curated cards + the note, nothing staged", () => {
    expect(
      readdirSync(curated)
        .filter((name) => !name.startsWith("."))
        .sort(),
    ).toEqual(["BACK.md", "cards", "products", "sources"]);
  });
});
