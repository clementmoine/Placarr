import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { pokemonShadersDumpFresh } from "./shadersDumpFresh";

describe("pokemonShadersDumpFresh", () => {
  it("is true when foil outputs are not older than shadersbundle", () => {
    const root = mkdtempSync(path.join(tmpdir(), "shaders-fresh-"));
    const packDir = path.join(root, "foil");
    const bundle = path.join(root, "shadersbundle");
    mkdirSync(path.join(packDir, "shaders"), { recursive: true });
    mkdirSync(path.join(packDir, "textures"), { recursive: true });
    writeFileSync(bundle, "bundle");
    writeFileSync(path.join(packDir, "materialSheets.json"), "{}");
    writeFileSync(path.join(packDir, "shared-motifs.json"), "{}");
    writeFileSync(path.join(packDir, "shaders", "Rainbow.frag"), "frag");
    writeFileSync(path.join(packDir, "textures", "noise.webp"), "tex");
    expect(pokemonShadersDumpFresh(packDir, bundle)).toBe(true);
  });

  it("is false when material sheets are missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "shaders-miss-"));
    const packDir = path.join(root, "foil");
    const bundle = path.join(root, "shadersbundle");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(bundle, "bundle");
    expect(pokemonShadersDumpFresh(packDir, bundle)).toBe(false);
  });
});
