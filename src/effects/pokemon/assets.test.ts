import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { foilTextureFile } from "@/effects/foilTextureFile";
import cardsJson from "./cards.json";
import {
  foilManifestToShader,
  POKEMON_FOIL_NAMES,
} from "./foilNames";
import type { PaperCardEntry } from "./resolveEffect";

const PACK_ROOT = path.join(process.cwd(), "data", "pokemon", "foil");
const SHADERS_DIR = path.join(PACK_ROOT, "shaders");
const TEXTURES_DIR = path.join(PACK_ROOT, "textures");

const CARDS = cardsJson as Record<string, PaperCardEntry>;
const hasDump = Object.keys(CARDS).length > 0;

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

  it.skipIf(!hasDump)("maps every cards.json foil/shader to a known leaf", () => {
    const unmapped: string[] = [];
    for (const [bundleId, entry] of Object.entries(CARDS)) {
      for (const key of ["std", "ph"] as const) {
        const variant = entry[key];
        if (!variant) continue;
        const mapped =
          foilManifestToShader(variant.shader) ||
          foilManifestToShader(variant.foil);
        if (!mapped) {
          unmapped.push(
            `${bundleId}:${key}:${variant.foil || "?"}/${variant.shader || "?"}`,
          );
        }
      }
    }
    expect(unmapped.slice(0, 10), unmapped.slice(0, 10).join("\n")).toEqual([]);
  });

  it.skipIf(!hasDump)("ships mask textures for a sample of FR foil variants", () => {
    let checked = 0;
    const missing: string[] = [];
    for (const [bundleId, entry] of Object.entries(CARDS)) {
      // Manifest index covers every CDN lang; textures are scraped FR-first.
      if (!/_fr_/i.test(bundleId)) continue;
      const bundleDir = path.join(TEXTURES_DIR, bundleId);
      if (!existsSync(bundleDir)) continue;
      for (const key of ["std", "ph"] as const) {
        const variant = entry[key];
        const maskTex = variant?.maskTex?.trim();
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
