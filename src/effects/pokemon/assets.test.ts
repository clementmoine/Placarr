import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Installs the SQLite `card_foil` lookups; without it the pack sees stubs.
import "./cardFoilIndex";

import { foilTextureFile } from "@/effects/foilTextureFile";
import { listBundleIds, variantsForBundle } from "./cardFoilLookups";
import {
  foilManifestToShader,
  POKEMON_FOIL_NAMES,
} from "./foilNames";

const PACK_ROOT = path.join(process.cwd(), "data", "pokemon", "foil");
const SHADERS_DIR = path.join(PACK_ROOT, "shaders");
const TEXTURES_DIR = path.join(PACK_ROOT, "textures");

const BUNDLE_IDS = listBundleIds();
const hasDump = BUNDLE_IDS.length > 0;

function packFile(...names: string[]): boolean {
  return names.some((name) => existsSync(path.join(PACK_ROOT, name)));
}

const hasCardBack = packFile("card_back.webp", "card_back.png");

describe("pokemon pack assets", () => {
  it("declares the pack default card back URL", () => {
    expect("/foil/pokemon/card_back.webp").toMatch(/card_back\.webp$/);
  });

  it.skipIf(!hasCardBack)(
    "ships card_back.webp extracted from Live APK (Texture2D cardBack)",
    () => {
      expect(hasCardBack).toBe(true);
    },
  );

  it.skipIf(!hasDump)("ships WebGL-ready frags (no orphan FRAGMENT #endif)", () => {
    for (const name of POKEMON_FOIL_NAMES) {
      const text = readFileSync(
        path.join(SHADERS_DIR, `${name}.frag`),
        "utf8",
      );
      expect(text.includes("#ifdef FRAGMENT"), name).toBe(false);
      expect(text.trimEnd().endsWith("#endif"), name).toBe(false);
      expect(text.includes("\x17"), name).toBe(false);
    }
  });

  it.skipIf(!hasDump)("ships full_foil_mask + shared motifs", () => {
    expect(packFile("full_foil_mask.webp", "full_foil_mask.png")).toBe(true);
    const shared = path.join(TEXTURES_DIR, "_shared");
    expect(existsSync(shared)).toBe(true);
    expect(
      readdirSync(shared).filter((name) => !name.startsWith(".")).length,
    ).toBeGreaterThan(0);
  });

  it.skipIf(!hasDump)("maps every dumped foil/shader to a known leaf", () => {
    const unmapped: string[] = [];
    for (const bundleId of BUNDLE_IDS) {
      for (const variant of variantsForBundle(bundleId)) {
        const mapped =
          foilManifestToShader(variant.shader) ||
          foilManifestToShader(variant.foil);
        if (!mapped) {
          unmapped.push(
            `${bundleId}:${variant.variant}:${variant.foil || "?"}/${variant.shader || "?"}`,
          );
        }
      }
    }
    expect(unmapped.slice(0, 10), unmapped.slice(0, 10).join("\n")).toEqual([]);
  });

  it.skipIf(!hasDump)("ships mask textures for a sample of FR foil variants", () => {
    let checked = 0;
    const missing: string[] = [];
    for (const bundleId of BUNDLE_IDS) {
      // Manifest index covers every CDN lang; textures are scraped FR-first.
      if (!/_fr_/i.test(bundleId)) continue;
      const bundleDir = path.join(TEXTURES_DIR, bundleId);
      if (!existsSync(bundleDir)) continue;
      for (const variant of variantsForBundle(bundleId)) {
        const maskTex = variant.maskTex.trim();
        if (!maskTex) continue;
        checked += 1;
        if (checked % 400 !== 1) continue;
        const file = foilTextureFile(maskTex);
        const webp = path.join(bundleDir, file);
        const png = path.join(
          bundleDir,
          file.replace(/\.webp$/i, ".png"),
        );
        if (!existsSync(webp) && !existsSync(png)) {
          missing.push(`${bundleId}/${file}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
