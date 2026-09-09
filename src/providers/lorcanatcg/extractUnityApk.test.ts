import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { lorcanaUnityArtifactsFresh } from "./extractUnityApk";

describe("lorcanaUnityArtifactsFresh", () => {
  it("is true when shaders, textures, manifest and back are not older than APKs", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "lorcana-fresh-"));
    const foil = path.join(repo, "data/lorcana/foil");
    const cards = path.join(repo, "data/lorcana/cards");
    const apks = path.join(repo, "data/lorcana/staging/apks");
    mkdirSync(path.join(foil, "shaders"), { recursive: true });
    mkdirSync(path.join(foil, "textures"), { recursive: true });
    mkdirSync(cards, { recursive: true });
    mkdirSync(apks, { recursive: true });
    writeFileSync(path.join(apks, "base.apk"), "apk");
    writeFileSync(path.join(foil, "manifest.json"), "{}");
    writeFileSync(path.join(foil, "shaders", "tilt.frag"), "frag");
    writeFileSync(path.join(foil, "textures", "noise.webp"), "tex");
    writeFileSync(path.join(cards, "back.webp"), "back");
    expect(lorcanaUnityArtifactsFresh(repo)).toBe(true);
  });

  it("is false when the foil dump is incomplete", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "lorcana-stale-"));
    mkdirSync(path.join(repo, "data/lorcana/staging/apks"), { recursive: true });
    writeFileSync(path.join(repo, "data/lorcana/staging/apks/base.apk"), "apk");
    expect(lorcanaUnityArtifactsFresh(repo)).toBe(false);
  });
});
