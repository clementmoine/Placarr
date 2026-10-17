/**
 * Texture2D ETC1 / DXT1 decode (TEX_StitchedRings and peers).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canDecodeTextureFormat,
  decodeTextureTree,
  TextureFormat,
} from "@/lib/unity/texture2d";
import { iterClassTrees, loadUnityFs } from "@/lib/unity/loadUnityFs";
import { repoRoot } from "@/providers/shared/foilPaths";

describe("texture2d compressed formats", () => {
  it("recognises ETC1 and DXT1 alongside ASTC", () => {
    expect(canDecodeTextureFormat(TextureFormat.ETC_RGB4)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.DXT1)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.ASTC_RGB_8x8)).toBe(true);
    expect(canDecodeTextureFormat(0)).toBe(false);
  });

  it("decodes TEX_StitchedRings from CDN shadersbundle (ETC_RGB4)", () => {
    const bundle = path.join(
      repoRoot(),
      "data/pokemon/staging/cdn-bundles/shadersbundle",
    );
    if (!existsSync(bundle)) return;

    const loaded = loadUnityFs(readFileSync(bundle));
    let hit = false;
    for (const tree of iterClassTrees(loaded, 28)) {
      if (tree.m_Name !== "TEX_StitchedRings") continue;
      hit = true;
      expect(Number(tree.m_TextureFormat)).toBe(TextureFormat.ETC_RGB4);
      const decoded = decodeTextureTree(tree, loaded);
      expect(decoded, "ETC1 typetree decode").toBeTruthy();
      expect(decoded!.width).toBe(1024);
      expect(decoded!.height).toBe(1024);
      expect(decoded!.rgba.length).toBe(1024 * 1024 * 4);
      // Plate is not flat black — concentric rings carry luminance.
      let bright = 0;
      for (let i = 0; i < decoded!.rgba.length; i += 64) {
        if ((decoded!.rgba[i]! + decoded!.rgba[i + 1]! + decoded!.rgba[i + 2]!) / 3 > 40) {
          bright += 1;
        }
      }
      expect(bright).toBeGreaterThan(100);
    }
    expect(hit).toBe(true);
  });
});
