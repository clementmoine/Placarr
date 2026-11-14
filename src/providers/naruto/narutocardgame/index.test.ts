import path from "node:path";
import { describe, expect, it } from "vitest";

import { narutoCardgameEffectPack } from "@/effects/narutocardgame";
import { listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";

import { narutocardgameModule } from "./index";
import { NARUTO_CARDGAME_EFFECT_PACK_ID, NARUTO_CARDGAME_PACK_ID, NARUTO_CARDGAME_PRINT_GAME, NARUTO_CARDGAME_PROVIDER_ID } from "./pack";
import { narutoCardgameCuratedDir } from "./curatedPaths";
import { narutoCardgamePrintKey } from "./printKey";

describe("narutocardgame module", () => {
  it("exposes a living empty local catalogue line", () => {
    expect(narutocardgameModule.info.id).toBe(NARUTO_CARDGAME_PROVIDER_ID);
    expect(narutocardgameModule.catalog?.dataPack).toBe(NARUTO_CARDGAME_PACK_ID);
    expect(narutocardgameModule.catalog?.effectPack).toBe(
      NARUTO_CARDGAME_EFFECT_PACK_ID,
    );
    expect(narutocardgameModule.printGames).toEqual([NARUTO_CARDGAME_PRINT_GAME]);
    expect(narutoCardgamePrintKey("preview", "g01")).toBe(
      "narutocardgame:preview-g01",
    );
  });
});

describe("narutocardgame curated backs", () => {
  it("ships four Bandai logo-side sleeves", () => {
    expect(
      listCuratedBackSources(
        path.join(narutoCardgameCuratedDir(), "cards"),
      ).map((row) => row.destRel),
    ).toEqual([
      "back.chakra.webp",
      "back.leader.webp",
      "back.summon.webp",
      "back.webp",
    ]);
  });

  it("resolves type-coloured backs from printKey", () => {
    expect(narutoCardgameEffectPack.cardBackUrl).toBe(
      "/assets/naruto/cardgame/backs/en",
    );
    expect(
      narutoCardgameEffectPack.resolveCardBack?.({
        printKey: "narutocardgame:demo-c001",
      }),
    ).toBe("/assets/naruto/cardgame/backs/en/tiers/chakra");
    expect(
      narutoCardgameEffectPack.resolveCardBack?.({
        printKey: "narutocardgame:demo-n001",
      }),
    ).toBe("/assets/naruto/cardgame/backs/en/tiers/leader");
    expect(
      narutoCardgameEffectPack.resolveCardBack?.({
        printKey: "narutocardgame:preview-g01",
      }),
    ).toBeNull();
  });
});
