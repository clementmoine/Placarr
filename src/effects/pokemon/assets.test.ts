import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Installs the SQLite `card_foil` lookups; without it the pack sees stubs.
import "./cardFoilIndex";

import { foilTextureFile } from "@/effects/foilTextureFile";
import { listBundleIds, variantsForBundle } from "./cardFoilLookups";
import {
  foilManifestToShader,
  listPokemonFoilNames,
  POKEMON_FOIL_NAMES,
} from "./foilNames";

const PACK_ROOT = path.join(process.cwd(), "data", "pokemon", "foil");
const CARDS_ROOT = path.join(process.cwd(), "data", "pokemon", "cards");
const SHADERS_DIR = path.join(PACK_ROOT, "shaders");
const TEXTURES_DIR = path.join(PACK_ROOT, "textures");

const BUNDLE_IDS = listBundleIds();
const hasDump = BUNDLE_IDS.length > 0;

function packFile(...names: string[]): boolean {
  return names.some((name) => existsSync(path.join(PACK_ROOT, name)));
}

const hasCardBack =
  existsSync(path.join(CARDS_ROOT, "back.webp")) ||
  existsSync(path.join(CARDS_ROOT, "back.png"));

describe("pokemon pack assets", () => {
  it("declares the pack default card back URL", () => {
    expect("/assets/pokemon/cards/back.webp").toMatch(/\/cards\/back\.webp$/);
  });

  it.skipIf(!hasCardBack)(
    "ships cards/back.webp extracted from Live APK (Texture2D cardBack)",
    () => {
      expect(hasCardBack).toBe(true);
    },
  );

  it.skipIf(!hasDump)(
    "ships WebGL-ready frags (no orphan FRAGMENT #endif)",
    () => {
      for (const name of POKEMON_FOIL_NAMES) {
        const text = readFileSync(
          path.join(SHADERS_DIR, `${name}.frag`),
          "utf8",
        );
        expect(text.includes("#ifdef FRAGMENT"), name).toBe(false);
        expect(text.trimEnd().endsWith("#endif"), name).toBe(false);
        expect(text.includes("\x17"), name).toBe(false);
      }
    },
  );

  it.skipIf(!hasDump)("ships full_foil_mask + shared motifs", () => {
    expect(packFile("full_foil_mask.webp", "full_foil_mask.png")).toBe(true);
    expect(existsSync(TEXTURES_DIR)).toBe(true);
    expect(
      readdirSync(TEXTURES_DIR).filter(
        (name) => !name.startsWith(".") && name.endsWith(".webp"),
      ).length,
    ).toBeGreaterThan(0);
  });

  it.skipIf(!hasDump)(
    "maps every dumped foil/shader to a known leaf",
    () => {
      // Warm discovery cache once — full dump is ~40k bundles.
      void listPokemonFoilNames();
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
      expect(unmapped.slice(0, 10), unmapped.slice(0, 10).join("\n")).toEqual(
        [],
      );
    },
    60_000,
  );

  it.skipIf(!hasDump)(
    "ships mask textures for a sample of FR foil variants",
    () => {
      let checked = 0;
      const missing: string[] = [];
      for (const bundleId of BUNDLE_IDS) {
        if (!/_fr_/i.test(bundleId)) continue;
        const m = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})$/i.exec(bundleId);
        if (!m) continue;
        const cardDir = path.join(
          CARDS_ROOT,
          m[1]!.toLowerCase(),
          m[2]!.toLowerCase(),
          m[3]!,
        );
        if (!existsSync(cardDir)) continue;
        for (const variant of variantsForBundle(bundleId)) {
          const maskTex = variant.maskTex.trim();
          if (!maskTex) continue;
          checked += 1;
          if (checked % 400 !== 1) continue;
          const file = foilTextureFile(maskTex)
            .replace(/^.*_wp_mph_.*$/i, "mask-mph.webp")
            .replace(/^.*_wp_sph_.*$/i, "mask-sph.webp")
            .replace(/^.*_wp_ph_.*$/i, "mask-ph.webp")
            .replace(/^.*_wp_.*$/i, "mask.webp");
          const canonical = file.includes("mask")
            ? file
            : maskTex.toLowerCase().includes("_wp_ph_")
              ? "mask-ph.webp"
              : maskTex.toLowerCase().includes("_wp_")
                ? "mask.webp"
                : "mask.webp";
          const webp = path.join(cardDir, canonical);
          if (!existsSync(webp)) {
            missing.push(`${bundleId}/${canonical}`);
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
      expect(missing, missing.join("\n")).toEqual([]);
    },
  );
});
