import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { FoilMaterial } from "@/core/render/foil/types";

import {
  isLorcanaCssOnlyFoilMask,
  LORCANA_FULL_FOIL_MASK_URL,
} from "./index";

const PACK_ROOT = path.join(process.cwd(), "data", "lorcana", "foil");
const TEXTURES_DIR = path.join(PACK_ROOT, "textures");
const MANIFEST_PATH = path.join(PACK_ROOT, "manifest.json");

const MATERIALS = (
  existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<
        string,
        FoilMaterial
      >)
    : {}
) as Record<string, FoilMaterial>;

describe("lorcana pack assets", () => {
  const hasDump = Object.keys(MATERIALS).length > 0;

  it.skipIf(!hasDump)("ships cards/back.webp on the pack", () => {
    expect(
      existsSync(
        path.join(process.cwd(), "data", "lorcana", "cards", "back.webp"),
      ) ||
        existsSync(
          path.join(process.cwd(), "data", "lorcana", "cards", "back.png"),
        ),
    ).toBe(true);
  });

  it("ships full_foil_mask.webp for attested Lorcast fills", () => {
    expect(existsSync(path.join(PACK_ROOT, "full_foil_mask.webp"))).toBe(true);
  });

  it("ships mask.attested.webp beside p2-36 Lorcast art", () => {
    expect(
      existsSync(
        path.join(
          process.cwd(),
          "data",
          "lorcana",
          "cards",
          "p2",
          "en",
          "36",
          "mask.attested.webp",
        ),
      ),
    ).toBe(true);
  });

  it.skipIf(!hasDump)("ships at least one ASTC texture", () => {
    const astcFiles = readdirSync(TEXTURES_DIR).filter((name) =>
      name.endsWith(".astc"),
    );
    expect(astcFiles.length).toBeGreaterThan(0);
  });

  it.skipIf(!hasDump)(
    "manifest binds at least one texture with astc metadata",
    () => {
      const hasAstc = Object.values(MATERIALS).some((material) =>
        Object.values(material.textures).some((binding) => binding.astc?.file),
      );
      expect(hasAstc).toBe(true);
    },
  );

  it.skipIf(!hasDump)(
    "every astc.file named in the manifest exists on disk",
    () => {
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
    },
  );

  it.skipIf(!hasDump)(
    "every PNG file in manifest bindings exists on disk",
    () => {
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
    },
  );
});

describe("lorcana css-only foil masks", () => {
  it("keeps only the solid full-face plate off WebGL", () => {
    expect(isLorcanaCssOnlyFoilMask(LORCANA_FULL_FOIL_MASK_URL)).toBe(true);
    expect(
      isLorcanaCssOnlyFoilMask(
        "/assets/lorcana/cards/p2/en/36/mask.attested.webp",
      ),
    ).toBe(false);
    expect(
      isLorcanaCssOnlyFoilMask("/assets/lorcana/cards/6/en/25-p2/mask.jpg"),
    ).toBe(false);
  });
});
