/**
 * UnityFS Texture2D ASTC → WebP (Node, ADR-021 phase B).
 */
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { cropCardRgba, loadUvRectFromJson } from "@/lib/unity/cardCrop";
import { decodeTexturesFromUnityFs } from "@/lib/unity/texture2d";
import {
  canonicalFaceFilename,
  extractCardBundleTextures,
  loadUvRectFile,
} from "@/providers/pokemontcglive/extractCardTextures";
import { repoRoot } from "@/providers/shared/foilPaths";

describe("unity Texture2D (Node)", () => {
  it("canonical_face_filename_matches_extract_py", () => {
    expect(canonicalFaceFilename("xybsp_fr_019", "xybsp_fr_019")).toBe(
      "art.webp",
    );
    expect(canonicalFaceFilename("xybsp_fr_019", "xybsp_wp_fr_019")).toBe(
      "mask.webp",
    );
    expect(
      canonicalFaceFilename("me4_fr_001", "me4_foil_fr_001", { asMask: true }),
    ).toBe("mask.webp");
    expect(canonicalFaceFilename("swsh10_it_008", "swsh10_etch_it_008")).toBe(
      "etch.webp",
    );
  });

  it("decodes_ASTC_card_bundle_within_1_of_UnityPy_pixels", async () => {
    const repo = repoRoot();
    const card = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/xybsp_fr_019",
    );
    const pyRaw = "/tmp/placarr-py-raw.rgba";
    if (!existsSync(card) || !existsSync(pyRaw)) return;

    const tex = decodeTexturesFromUnityFs(readFileSync(card)).find(
      (t) => t.name === "xybsp_fr_019",
    );
    expect(tex).toBeTruthy();
    const py = readFileSync(pyRaw);
    expect(tex!.rgba.length).toBe(py.length);
    let maxd = 0;
    let sum = 0;
    for (let i = 0; i < py.length; i++) {
      const d = Math.abs(tex!.rgba[i]! - py[i]!);
      if (d > maxd) maxd = d;
      sum += d;
    }
    expect(maxd).toBeLessThanOrEqual(1);
    expect(sum / py.length).toBeLessThan(0.5);
  });

  it("extracts_art_and_mask_webp_cropped_like_disk", async () => {
    const repo = repoRoot();
    const card = path.join(
      repo,
      "data/pokemon/staging/cdn-bundles/xybsp_fr_019",
    );
    const diskArt = path.join(repo, "data/pokemon/cards/xybsp/fr/019/art.webp");
    const uvPath = path.join(repo, "data/pokemon/foil/card-uv-rect.json");
    if (!existsSync(card) || !existsSync(diskArt) || !existsSync(uvPath)) {
      return;
    }

    const dir = mkdtempSync(path.join(tmpdir(), "placarr-unity-b-"));
    try {
      const cropRect = loadUvRectFile(path.join(repo, "data/pokemon/foil"));
      expect(cropRect).toBeTruthy();
      const result = await extractCardBundleTextures(card, dir, {
        textureMode: "cards",
        cropRect,
      });
      expect(result.written.some((p) => p.endsWith("art.webp"))).toBe(true);
      expect(result.written.some((p) => p.endsWith("mask.webp"))).toBe(true);
      expect(result.rows[0]?.cardTex).toBe("xybsp_fr_019");

      const sharp = (await import("sharp")).default;
      const disk = await sharp(diskArt)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const node = await sharp(path.join(dir, "art.webp"))
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(node.info.width).toBe(disk.info.width);
      expect(node.info.height).toBe(disk.info.height);
      let maxd = 0;
      for (let i = 0; i < disk.data.length; i++) {
        const d = Math.abs(node.data[i]! - disk.data[i]!);
        if (d > maxd) maxd = d;
      }
      expect(maxd).toBeLessThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cropCardRgba_is_noop_when_not_square", () => {
    const rgba = Buffer.alloc(8 * 10 * 4, 7);
    const out = cropCardRgba(rgba, 8, 10, {
      u0: 0.1,
      u1: 0.9,
      v0: 0,
      v1: 1,
    });
    expect(out.width).toBe(8);
    expect(out.height).toBe(10);
  });

  it("loadUvRectFromJson_reads_foil_sidecar_shape", () => {
    const rect = loadUvRectFromJson({
      uvRect: { u0: 0.1, u1: 0.9, v0: 0, v1: 1 },
    });
    expect(rect).toEqual({ u0: 0.1, u1: 0.9, v0: 0, v1: 1 });
  });
});
