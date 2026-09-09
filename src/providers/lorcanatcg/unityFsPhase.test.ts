/**
 * Lorcana Unity extract golden parity (Node vs Python ground truth).
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveAssetManager, resourceBlobsFromAssetManager } from "@/lib/unity/loadUnityFs";
import {
  pixelsFromTextureObject,
  rgbaFromTexture2DObject,
  textureFormatId,
} from "@/lib/unity/texture2d";
import {
  extractLorcanaShaders,
  LORCANA_SHADER_FRAG_COUNT,
  shadersByPathFromManager,
} from "@/providers/lorcanatcg/extractLorcanaShaders";
import { buildLorcanaManifest } from "@/providers/lorcanatcg/lorcanaMaterials";
import {
  dumpLorcanaCardBack,
} from "@/providers/lorcanatcg/lorcanaTextures";
import { primaryUnityBundlePath } from "@/providers/lorcanatcg/extractUnityApk";
import { LORCANA_UNITY_REVISION } from "@/providers/lorcanatcg/unityRevision";
import { foilPackDir, repoRoot } from "@/providers/shared/foilPaths";

describe("lorcana unity extract (Node)", () => {
  it("shader_frags_match_disk_set", async () => {
    const repo = repoRoot();
    const dataDir = path.join(repo, "data/lorcana/staging/unity-data");
    const diskShaders = path.join(foilPackDir(repo, "lorcana"), "shaders");
    const bundle = primaryUnityBundlePath(dataDir);
    if (!existsSync(bundle) || !existsSync(diskShaders)) return;

    const tmpShaders = mkdtempSync(path.join(tmpdir(), "lorcana-shaders-"));
    try {
      const { files } = await extractLorcanaShaders({
        dataDir,
        shadersDir: tmpShaders,
      });

      const diskNames = new Set(
        readdirSync(diskShaders).filter((n) => n.endsWith(".frag")),
      );
      const nodeNames = new Set(files.keys());
      expect(nodeNames.size).toBe(LORCANA_SHADER_FRAG_COUNT);
      expect(nodeNames.size).toBe(diskNames.size);
      expect([...nodeNames].sort()).toEqual([...diskNames].sort());

      const sample = "CardFoilGlitter.frag";
      if (diskNames.has(sample)) {
        expect(files.get(sample)).toBe(
          readFileSync(path.join(diskShaders, sample), "utf8"),
        );
      }
    } finally {
      rmSync(tmpShaders, { recursive: true, force: true });
    }
  });

  it("manifest_keys_match_disk", async () => {
    const repo = repoRoot();
    const dataDir = path.join(repo, "data/lorcana/staging/unity-data");
    const diskManifest = path.join(foilPackDir(repo, "lorcana"), "manifest.json");
    const bundle = primaryUnityBundlePath(dataDir);
    if (!existsSync(bundle) || !existsSync(diskManifest)) return;

    const tmpShaders = mkdtempSync(path.join(tmpdir(), "lorcana-shaders-"));
    try {
      const bytes = readFileSync(bundle);
      const { maps, shadersByPath } = await extractLorcanaShaders({
        dataDir,
        shadersDir: tmpShaders,
        bundleBytes: bytes,
      });

      const am = await resolveAssetManager(bytes, {
        enableTypeTree: false,
        unityRevision: LORCANA_UNITY_REVISION,
      });

      const texturesByPath = new Map<string, string>();
      const textureSettingsByName = new Map<string, Record<string, unknown>>();
      const materials: unknown[] = [];

      for (const info of am.getObjectInfosByClass("Texture2D")) {
        try {
          const tex = info.object as { name?: string };
          const name = String(tex.name ?? "");
          if (name) texturesByPath.set(String(info.pathID), name);
        } catch {
          /* skip */
        }
      }
      for (const info of am.getObjectInfosByClass("Material")) {
        try {
          materials.push(info.object);
        } catch {
          /* skip */
        }
      }

      const { manifest } = buildLorcanaManifest(
        materials as never[],
        texturesByPath,
        textureSettingsByName as never,
        shadersByPath,
        maps,
        tmpShaders,
      );

      const disk = JSON.parse(readFileSync(diskManifest, "utf8")) as Record<
        string,
        unknown
      >;
      expect(Object.keys(manifest).sort()).toEqual(Object.keys(disk).sort());
    } finally {
      rmSync(tmpShaders, { recursive: true, force: true });
    }
  });

  it("streamed_astc_texture_decodes_without_decodeRgba", async () => {
    const repo = repoRoot();
    const dataDir = path.join(repo, "data/lorcana/staging/unity-data");
    const bundle = primaryUnityBundlePath(dataDir);
    if (!existsSync(bundle)) return;

    const bytes = readFileSync(bundle);
    const am = await resolveAssetManager(bytes, {
      enableTypeTree: false,
      unityRevision: LORCANA_UNITY_REVISION,
    });
    const resourceBlobs = resourceBlobsFromAssetManager(am);
    const info = am
      .getObjectInfosByClass("Texture2D")
      .find((i) => String(i.name ?? "") === "RainbowGradientGold");
    expect(info?.object).toBeTruthy();
    const tex = info!.object as {
      width?: number;
      height?: number;
      data?: Uint8Array | null;
      decodeRgba?: () => Promise<Uint8Array | null>;
    };
    expect(tex.data == null || tex.data.byteLength === 0).toBe(true);
    expect(textureFormatId(tex)).toBe(50);
    expect(pixelsFromTextureObject(tex, resourceBlobs)?.byteLength).toBeGreaterThan(
      0,
    );

    const decoded = await rgbaFromTexture2DObject(tex, "RainbowGradientGold", {
      resourceBlobs,
    });
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(1024);
    expect(decoded!.height).toBe(32);
    expect(decoded!.rgba.byteLength).toBe(1024 * 32 * 4);
  });

  it("card_back_from_sprite_atlas", async () => {
    const repo = repoRoot();
    const dataDir = path.join(repo, "data/lorcana/staging/unity-data");
    const bundle = primaryUnityBundlePath(dataDir);
    if (!existsSync(bundle)) return;

    const tmp = mkdtempSync(path.join(tmpdir(), "lorcana-back-"));
    try {
      const dest = path.join(tmp, "back.webp");
      expect(await dumpLorcanaCardBack(bundle, dest)).toBe(true);
      expect(existsSync(dest)).toBe(true);
      expect(statSync(dest).size).toBeGreaterThan(1000);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
