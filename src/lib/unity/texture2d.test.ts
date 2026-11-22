/**
 * Texture2D ETC1 / DXT1 decode (TEX_StitchedRings and peers).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canDecodeTextureFormat,
  decodeTextureFormat,
  decodeTextureTree,
  dxtMipByteSize,
  rawS3tcMip0FromTree,
  rgbaFromTexture2DObject,
  TextureFormat,
  textureFormatId,
} from "@/lib/unity/texture2d";
import {
  iterClassTrees,
  loadUnityFs,
  type LoadedUnityFs,
} from "@/lib/unity/loadUnityFs";
import { repoRoot } from "@/providers/shared/foilPaths";

/** Minimal LoadedUnityFs — inline `image data` never touches resource blobs. */
const EMPTY_LOADED = {
  resourceBlobs: new Map(),
} as unknown as LoadedUnityFs;

describe("texture2d compressed formats", () => {
  it("recognises ETC1 and DXT1 alongside ASTC", () => {
    expect(canDecodeTextureFormat(TextureFormat.ETC_RGB4)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.DXT1)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.DXT5)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.BC7)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.RGB24)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.RGBA32)).toBe(true);
    expect(canDecodeTextureFormat(TextureFormat.ASTC_RGB_8x8)).toBe(true);
    expect(canDecodeTextureFormat(0)).toBe(false);
  });

  it("maps unityfs-js textureFormat name strings (HoloMap_main2 is RGBA32)", () => {
    expect(textureFormatId({ textureFormat: "RGBA32" })).toBe(
      TextureFormat.RGBA32,
    );
    expect(textureFormatId({ textureFormat: "RGB24" })).toBe(
      TextureFormat.RGB24,
    );
    expect(textureFormatId({ textureFormat: "DXT5" })).toBe(TextureFormat.DXT5);
  });

  it("expands RGB24 to opaque RGBA", () => {
    const rgba = decodeTextureFormat(
      new Uint8Array([10, 20, 30]),
      1,
      1,
      TextureFormat.RGB24,
      "pixel",
    );
    expect([...rgba]).toEqual([10, 20, 30, 255]);
  });

  it("decodes a flat white DXT5 block", () => {
    const block = new Uint8Array(16);
    block[0] = 255;
    block[1] = 0;
    block[8] = 0xff;
    block[9] = 0xff;
    block[10] = 0xff;
    block[11] = 0xff;
    const rgba = decodeTextureFormat(block, 4, 4, TextureFormat.DXT5, "white");
    expect(rgba.length).toBe(4 * 4 * 4);
    expect(rgba[0]).toBeGreaterThan(240);
    expect(rgba[3]).toBeGreaterThan(240);
  });

  it("rawS3tcMip0FromTree returns DXT5 mip0 bytes for catalogue Front sidecars", () => {
    const mip0 = dxtMipByteSize(4, 4, TextureFormat.DXT5);
    const block = new Uint8Array(mip0);
    block[0] = 255;
    block[8] = 0xff;
    const tree = {
      m_Name: "ST01-004_front",
      m_Width: 4,
      m_Height: 4,
      m_TextureFormat: TextureFormat.DXT5,
      m_ColorSpace: 0,
      "image data": block,
    };
    const raw = rawS3tcMip0FromTree(tree, EMPTY_LOADED);
    expect(raw).toMatchObject({
      width: 4,
      height: 4,
      format: TextureFormat.DXT5,
      srgb: false,
      glFormat: "COMPRESSED_RGBA_S3TC_DXT5_EXT",
    });
    expect(raw!.data.byteLength).toBe(mip0);
    expect(
      rawS3tcMip0FromTree(
        { ...tree, m_TextureFormat: TextureFormat.RGBA32 },
        EMPTY_LOADED,
      ),
    ).toBeNull();
  });

  it("BGRA→RGBA on DXT5: Cost_Blue centre is blue without a game-side swap", () => {
    const bundles = path.join(
      process.env.HOME ?? "",
      "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
    );
    const file = path.join(bundles, "packdata_assets_card_frame.bundle");
    if (!existsSync(file)) return;

    const loaded = loadUnityFs(readFileSync(file));
    let decoded = null as ReturnType<typeof decodeTextureTree>;
    for (const tree of iterClassTrees(loaded, 28)) {
      if (tree.m_Name !== "Cost_Blue") continue;
      expect(Number(tree.m_TextureFormat)).toBe(TextureFormat.DXT5);
      decoded = decodeTextureTree(tree, loaded);
      break;
    }
    expect(decoded, "Cost_Blue DXT5").toBeTruthy();
    const { rgba, width, height } = decoded!;
    const i = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
    expect([rgba[i], rgba[i + 1], rgba[i + 2]]).toEqual([66, 119, 183]);
  });

  it("Alpha8 : RGB blanc, alpha lu tel quel", () => {
    const rgba = decodeTextureFormat(
      Uint8Array.from([0, 64, 128, 255]),
      2,
      2,
      TextureFormat.Alpha8,
    );
    // Retournement vertical : la 2e ligne Unity passe en haut.
    expect([...rgba]).toEqual([
      255, 255, 255, 128, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 64,
    ]);
  });

  it("RGBAHalf : float16 bornés à 0–1 puis en octets", () => {
    // 1.0, 0.5, 0.0, 2.0 (borné à 1).
    const halves = Uint16Array.from([0x3c00, 0x3800, 0x0000, 0x4000]);
    const rgba = decodeTextureFormat(
      new Uint8Array(halves.buffer),
      1,
      1,
      TextureFormat.RGBAHalf,
    );
    expect([...rgba]).toEqual([255, 128, 0, 255]);
  });

  it("un format non couvert rend null, sans second décodeur caché", async () => {
    const decoded = await rgbaFromTexture2DObject({
      width: 4,
      height: 4,
      textureFormat: 28, // DXT1Crunched
      data: new Uint8Array(64),
    });
    expect(decoded).toBeNull();
  });

  it("ETC1 sort en RGBA : un bloc rouge pur reste rouge (arkntools rend du BGRA)", () => {
    // Mode individuel, R1=R2=0xF, G=B=0, tables 0, indices 0 → modificateur +2.
    const block = Uint8Array.from([0xff, 0x00, 0x00, 0x00, 0, 0, 0, 0]);
    const rgba = decodeTextureFormat(block, 4, 4, TextureFormat.ETC_RGB4);
    for (let p = 0; p < 16; p++) {
      expect([...rgba.subarray(p * 4, p * 4 + 4)]).toEqual([255, 2, 2, 255]);
    }
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
