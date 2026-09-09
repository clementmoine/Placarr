/**
 * Unity APK card quad (Node, ADR-021 phase D).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { cardQuadFromApk, cardQuadFromObjText } from "@/lib/unity/cardQuad";
import { dumpPokemonCardApk } from "@/providers/pokemontcglive/dumpCardApk";
import { foilPackDir, packStagingDir, repoRoot } from "@/providers/shared/foilPaths";

describe("unity card quad (Node)", () => {
  it("cardQuadFromObjText_rejects_non_card_aspect", () => {
    const obj = [
      "v 0 0 0",
      "v 1 0 0",
      "v 1 1 0",
      "v 0 1 0",
      "vt 0 0",
      "vt 1 0",
      "vt 1 1",
      "vt 0 1",
      "vn 0 0 1",
      "vn 0 0 1",
      "vn 0 0 1",
      "vn 0 0 1",
    ].join("\n");
    expect(cardQuadFromObjText(obj)).toBeNull();
  });

  it("cardQuadFromApk_matches_disk_card_uv_rect", async () => {
    const repo = repoRoot();
    const apk = path.join(packStagingDir(repo, "pokemon"), "apks", "base.apk");
    const diskPath = path.join(foilPackDir(repo, "pokemon"), "card-uv-rect.json");
    if (!existsSync(apk) || !existsSync(diskPath)) return;

    const quad = await cardQuadFromApk(apk);
    expect(quad).toBeTruthy();
    const disk = JSON.parse(readFileSync(diskPath, "utf8")) as {
      uvRect: Record<string, number>;
      aspect: number;
      frontVertices: number;
    };

    for (const key of ["u0", "u1", "v0", "v1"] as const) {
      expect(Math.abs(quad!.uvRect[key] - disk.uvRect[key]!)).toBeLessThan(1e-5);
    }
    expect(Math.abs(quad!.aspect - disk.aspect)).toBeLessThan(1e-5);
    expect(quad!.frontVertices).toBe(disk.frontVertices);
  });

  it("dumpPokemonCardApk_writes_card_uv_rect_json", async () => {
    const repo = repoRoot();
    const apk = path.join(packStagingDir(repo, "pokemon"), "apks", "base.apk");
    if (!existsSync(apk)) return;

    const result = await dumpPokemonCardApk({ repo });
    expect(result.ok).toBe(true);
    expect(result.uvRectPath).toBeTruthy();
    expect(existsSync(result.uvRectPath!)).toBe(true);
  });
});
