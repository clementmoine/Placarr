/**
 * UnityFS Shader → `.frag` (Node, ADR-021 phase C).
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  extractShaderFragsFromBytes,
  toWebgl2Fragment,
} from "@/lib/unity/shader";
import { extractShadersBundle } from "@/providers/pokemontcglive/extractShadersBundle";
import { foilPackDir, repoRoot } from "@/providers/shared/foilPaths";

describe("unity Shader (Node)", () => {
  it("toWebgl2Fragment_strips_fragment_guard_and_hlslcc_defines", () => {
    const src = [
      "#ifdef FRAGMENT",
      "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1",
      "#define UNITY_SUPPORTS_UNIFORM_LOCATION 1",
      "void main() {}",
      "#endif",
    ].join("\n");
    expect(toWebgl2Fragment(src)).toBe(
      [
        "#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0",
        "#define UNITY_SUPPORTS_UNIFORM_LOCATION 0",
        "void main() {}",
        "",
      ].join("\n"),
    );
  });

  it("extracts_24_frags_byte_identical_to_disk", () => {
    const repo = repoRoot();
    const bundle = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/shadersbundle",
    );
    const diskDir = path.join(repo, "data/pokemon/foil/shaders");
    if (!existsSync(bundle) || !existsSync(diskDir)) return;

    const extracted = extractShaderFragsFromBytes(readFileSync(bundle));
    expect(extracted.length).toBe(24);

    for (const { foil, frag } of extracted) {
      const diskPath = path.join(diskDir, `${foil}.frag`);
      expect(existsSync(diskPath), `missing disk frag ${foil}`).toBe(true);
      expect(readFileSync(diskPath, "utf8")).toBe(frag);
    }
  });

  it("extractShadersBundle_writes_frag_stems_like_python", async () => {
    const repo = repoRoot();
    const bundle = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/shadersbundle",
    );
    const diskStems = path.join(repo, "data/pokemon/foil/frag-stems.json");
    if (!existsSync(bundle) || !existsSync(diskStems)) return;

    const dir = mkdtempSync(path.join(tmpdir(), "placarr-unity-c-"));
    try {
      const result = await extractShadersBundle({
        shadersBundlePath: bundle,
        packDir: dir,
        skipSharedTextures: true,
      });
      expect(result.shadersWritten.length).toBe(24);
      expect(readdirSync(path.join(dir, "shaders")).length).toBe(24);

      const stems = JSON.parse(readFileSync(path.join(dir, "frag-stems.json"), "utf8"))
        .stems as string[];
      const expected = JSON.parse(readFileSync(diskStems, "utf8")).stems as string[];
      expect(stems).toEqual(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extractShadersBundle_skips_AssetManager_when_shared_textures_exist", async () => {
    const repo = repoRoot();
    const bundle = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/shadersbundle",
    );
    const diskTex = path.join(repo, "data/pokemon/foil/textures");
    if (!existsSync(bundle) || !existsSync(diskTex)) return;

    const { cpSync } = await import("node:fs");
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-unity-c-tex-"));
    try {
      cpSync(diskTex, path.join(dir, "textures"), { recursive: true });
      const t0 = Date.now();
      const result = await extractShadersBundle({
        shadersBundlePath: bundle,
        packDir: dir,
        skipFrags: true,
      });
      // Resume path: loadUnityFs (~1s) + existence checks — not a second AM typetree.
      expect(Date.now() - t0).toBeLessThan(15_000);
      expect(result.sharedTextures).toBeGreaterThan(50);
      expect(Object.keys(result.textureFlags).length).toBe(70);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
