import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadUnityFs } from "@/lib/unity/loadUnityFs";

import {
  frostCardMaterialFallback,
  frostCatalogueComposeOrder,
  isFrostComposeOrderCurrent,
  parseFrostCardMaterial,
  type FrostCardMaterial,
} from "./frostCardMaterial";

function mat(
  partial: Partial<FrostCardMaterial> &
    Pick<FrostCardMaterial, "frontTex" | "useFront">,
): FrostCardMaterial {
  return {
    middleTex: null,
    frame2Tex: null,
    charaTex: null,
    costNumberTex: null,
    useMainTex: false,
    showMiddle: false,
    useFrame: false,
    useFrame2: false,
    useChara: false,
    useCostNumber: false,
    ...partial,
  };
}

describe("frostCatalogueComposeOrder", () => {
  it("falls back to picture→frame→text→costRing→badge without a Card material", () => {
    expect(
      frostCatalogueComposeOrder({
        material: null,
        hasText: true,
        hasCostRing: true,
        hasBadge: true,
      }),
    ).toEqual(["picture", "frame", "text", "costRing", "badge"]);
  });

  it("skips frame when Material Card gates _UseFrame off (mono baked chrome)", () => {
    expect(
      frostCatalogueComposeOrder({
        material: mat({
          frontTex: "FB01-084_Card",
          useFront: true,
          useFrame: false,
        }),
        hasText: true,
        hasCostRing: false,
        hasBadge: false,
      }),
    ).toEqual(["picture", "text"]);
  });

  it("stacks Back→Frame→Middle→frameTop→text→costRing→badge", () => {
    expect(
      frostCatalogueComposeOrder({
        material: mat({
          frontTex: "FB11-088_Back",
          middleTex: "FB11-088_Front",
          useFront: true,
          useFrame: true,
          showMiddle: true,
          useFrame2: true,
          frame2Tex: "FB11-088_Text_Ja",
        }),
        hasText: true,
        hasCostRing: true,
        hasBadge: true,
        hasFrameTop: true,
      }),
    ).toEqual([
      "picture",
      "frame",
      "middle",
      "frameTop",
      "text",
      "costRing",
      "badge",
    ]);
  });

  it("keeps lang text when Frame2/Chara are unbound in the dump", () => {
    expect(
      frostCatalogueComposeOrder({
        material: mat({
          frontTex: "ST01-002_Card",
          useFront: true,
          useFrame: true,
          useFrame2: false,
        }),
        hasText: true,
        hasCostRing: true,
        hasBadge: true,
      }),
    ).toEqual(["picture", "frame", "text", "costRing", "badge"]);
  });
});

describe("isFrostComposeOrderCurrent", () => {
  it("rejects costRing / missing frameTop under Middle", () => {
    expect(
      isFrostComposeOrderCurrent([
        "picture",
        "frame",
        "costRing",
        "middle",
        "text",
        "badge",
      ]),
    ).toBe(false);
    expect(
      isFrostComposeOrderCurrent([
        "picture",
        "frame",
        "middle",
        "text",
        "costRing",
        "badge",
      ]),
    ).toBe(false);
    expect(
      isFrostComposeOrderCurrent([
        "picture",
        "frame",
        "middle",
        "frameTop",
        "text",
        "costRing",
        "badge",
      ]),
    ).toBe(true);
  });
});

describe("frostCardMaterialFallback", () => {
  it("enables Front+Frame for heuristic extracts without a Card material", () => {
    expect(frostCardMaterialFallback("SB02-024_Card")).toMatchObject({
      frontTex: "SB02-024_Card",
      useFront: true,
      useFrame: true,
      showMiddle: false,
    });
  });
});

describe("parseFrostCardMaterial", () => {
  const bundle = path.join(
    os.homedir(),
    "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX/packdata_assets_card_series_fb11_fb11-088.bundle",
  );

  it.skipIf(!existsSync(bundle))(
    "reads FB11-088 Card slots (Back under Middle over Frame)",
    () => {
      const mat = parseFrostCardMaterial(loadUnityFs(readFileSync(bundle)));
      expect(mat).toMatchObject({
        frontTex: "FB11-088_Back",
        middleTex: "FB11-088_Front",
        useFront: true,
        showMiddle: true,
        useFrame: true,
      });
      expect(
        frostCatalogueComposeOrder({
          material: mat,
          hasText: true,
          hasCostRing: true,
          hasBadge: true,
          hasFrameTop: true,
        }),
      ).toEqual([
        "picture",
        "frame",
        "middle",
        "frameTop",
        "text",
        "costRing",
        "badge",
      ]);
    },
  );
});
