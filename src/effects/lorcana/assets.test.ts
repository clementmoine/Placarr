import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import manifestJson from "./manifest.json";
import type { FoilMaterial } from "@/core/render/foil/types";

const PACK_ROOT = path.join(process.cwd(), "public", "foil", "lorcana");
const TEXTURES_DIR = path.join(PACK_ROOT, "textures");

const MATERIALS = manifestJson as Record<string, FoilMaterial>;

describe("lorcana pack assets", () => {
  it("ships card_back.png on the pack", () => {
    expect(existsSync(path.join(PACK_ROOT, "card_back.png"))).toBe(true);
  });

  it("ships at least one ASTC texture", () => {
    const astcFiles = readdirSync(TEXTURES_DIR).filter((name) =>
      name.endsWith(".astc"),
    );
    expect(astcFiles.length).toBeGreaterThan(0);
  });

  it("manifest binds at least one texture with astc metadata", () => {
    const hasAstc = Object.values(MATERIALS).some((material) =>
      Object.values(material.textures).some((binding) => binding.astc?.file),
    );
    expect(hasAstc).toBe(true);
  });

  it("every astc.file named in the manifest exists on disk", () => {
    const astcFiles = new Set<string>();
    for (const material of Object.values(MATERIALS)) {
      for (const binding of Object.values(material.textures)) {
        if (binding.astc?.file) astcFiles.add(binding.astc.file);
      }
    }
    expect(astcFiles.size).toBeGreaterThan(0);
    for (const file of astcFiles) {
      expect(existsSync(path.join(TEXTURES_DIR, file)), file).toBe(true);
    }
  });

  it("every PNG file in manifest bindings exists on disk", () => {
    const pngFiles = new Set<string>();
    for (const material of Object.values(MATERIALS)) {
      for (const binding of Object.values(material.textures)) {
        if (binding.file) pngFiles.add(binding.file);
      }
    }
    expect(pngFiles.size).toBeGreaterThan(0);
    for (const file of pngFiles) {
      expect(existsSync(path.join(TEXTURES_DIR, file)), file).toBe(true);
    }
  });
});
