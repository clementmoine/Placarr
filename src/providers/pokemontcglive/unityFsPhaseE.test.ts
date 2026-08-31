/**
 * Full Node extract parity (ADR-021 phase E).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import sharp from "sharp";

import { cardBackRgbaFromApk } from "@/lib/unity/cardBack";
import { loadUvRectFromJson } from "@/lib/unity/cardCrop";
import { buildKeyedCards } from "@/providers/pokemontcglive/buildRuntimeCards";
import { buildMaterialSheetsFromBytes } from "@/providers/pokemontcglive/writeMaterialSheets";
import {
  foilPackDir,
  packCardsDir,
  packStagingDir,
  repoRoot,
} from "@/providers/shared/foilPaths";

describe("unity full extract (Node)", () => {
  it("buildKeyedCards_merges_std_and_ph", () => {
    const keyed = buildKeyedCards([
      {
        bundle: "bw10_fr_001",
        variant: "std",
        shaderPath: "TPCi/Cards3D/Standard/NonFoil",
        foil: "Standard_NonFoil_J",
        cardTex: "bw10_fr_001",
        maskTex: "",
        matPath: "",
        coldFoil: "",
        etch: "",
      },
      {
        bundle: "bw10_fr_001",
        variant: "ph",
        shaderPath: "",
        foil: "HoloFoil_Rainbow_Amplify_J",
        cardTex: "bw10_fr_001",
        maskTex: "bw10_wp_ph_fr_001",
        matPath: "",
        coldFoil: "",
        etch: "",
      },
    ]);
    expect(Object.keys(keyed["bw10_fr_001"]!)).toEqual(["std", "ph"]);
    expect(keyed["bw10_fr_001"]!.ph.shader).toBe("Rainbow");
    expect(keyed["bw10_fr_001"]!.std.shader).toBe("NonFoil");
  });

  it("buildMaterialSheets_matches_disk_sample", () => {
    const repo = repoRoot();
    const bundle = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/shadersbundle",
    );
    const diskPath = path.join(foilPackDir(repo, "pokemon"), "materialSheets.json");
    if (!existsSync(bundle) || !existsSync(diskPath)) return;

    const node = buildMaterialSheetsFromBytes(readFileSync(bundle)).sheets;
    const disk = JSON.parse(readFileSync(diskPath, "utf8")) as typeof node;

    for (const leaf of ["FlatSilver_CC", "SvUltraGoldRainbow", "Rainbow"]) {
      expect(node[leaf]?.floats._AnimationSpeed).toBe(
        disk[leaf]?.floats._AnimationSpeed,
      );
      expect(node[leaf]?.colors._LightDirection).toEqual([0, 1, 0, 0]);
      expect(disk[leaf]?.colors._LightDirection).toEqual([0, 1, 0, 0]);
    }
  });

  it("cardBackRgbaFromApk_matches_disk_dimensions", async () => {
    const repo = repoRoot();
    const apk = path.join(packStagingDir(repo, "pokemon"), "apks", "base.apk");
    const diskPath = path.join(packCardsDir(repo, "pokemon"), "back.webp");
    const uvPath = path.join(foilPackDir(repo, "pokemon"), "card-uv-rect.json");
    if (!existsSync(apk) || !existsSync(diskPath) || !existsSync(uvPath)) return;

    const uv = loadUvRectFromJson(JSON.parse(readFileSync(uvPath, "utf8")));
    const decoded = await cardBackRgbaFromApk(apk, uv);
    expect(decoded).toBeTruthy();

    const diskRaw = await sharp(diskPath).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    expect(decoded!.width).toBe(diskRaw.info.width);
    expect(decoded!.height).toBe(diskRaw.info.height);

    let delta = 0;
    let samples = 0;
    const stride = decoded!.width * 4;
    for (let y = 0; y < decoded!.height; y += 8) {
      for (let x = 0; x < decoded!.width; x += 8) {
        const ni = y * stride + x * 4;
        const di = y * diskRaw.info.width * 4 + x * 4;
        for (let c = 0; c < 3; c++) {
          delta += Math.abs(decoded!.rgba[ni + c]! - diskRaw.data[di + c]!);
        }
        samples++;
      }
    }
    expect(delta / (samples * 3)).toBeLessThan(2);
  });
});
