/**
 * Pack store audit: every foil leaf has a `.frag`, every `cards.json` variant
 * maps to a known shader, and every referenced mask texture exists under
 * `data/pokemon/foil/textures/` (``.webp``, legacy ``.png`` OK).
 *
 *   tsx scripts/pokemon/audit_store.ts
 *   tsx scripts/pokemon/audit_store.ts -- --strict
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  foilManifestToShader,
  POKEMON_FOIL_NAMES,
} from "../../src/effects/pokemon/foilNames";
import type { PaperCardEntry } from "../../src/effects/pokemon/resolveEffect";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACK_ROOT = path.join(ROOT, "data", "pokemon", "foil");
const CARDS_PATH = path.join(ROOT, "src", "effects", "pokemon", "cards.json");
const REPORT_PATH = path.join(
  ROOT,
  "data",
  "pokemon",
  "logs",
  "store-coverage.json",
);

type VariantKey = "std" | "ph";

function parseArgs(argv: string[]) {
  let strict = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--strict") strict = true;
  }
  return { strict };
}

function listFragStems(shadersDir: string): Set<string> {
  if (!existsSync(shadersDir)) return new Set();
  return new Set(
    readdirSync(shadersDir)
      .filter((name) => name.endsWith(".frag"))
      .map((name) => name.replace(/\.frag$/i, "")),
  );
}

function maskPath(bundleId: string, maskTex: string): string {
  const stem = maskTex.replace(/\.(png|webp)$/i, "");
  const webp = path.join(PACK_ROOT, "textures", bundleId, `${stem}.webp`);
  if (existsSync(webp)) return webp;
  return path.join(PACK_ROOT, "textures", bundleId, `${stem}.png`);
}

function main() {
  const { strict } = parseArgs(process.argv.slice(2));
  const cards = JSON.parse(readFileSync(CARDS_PATH, "utf8")) as Record<
    string,
    PaperCardEntry
  >;
  const frags = listFragStems(path.join(PACK_ROOT, "shaders"));
  const sharedDir = path.join(PACK_ROOT, "textures", "_shared");

  const missingFrags = POKEMON_FOIL_NAMES.filter((name) => !frags.has(name));
  const extraFrags = [...frags]
    .filter((name) => !POKEMON_FOIL_NAMES.includes(name as (typeof POKEMON_FOIL_NAMES)[number]))
    .sort();

  const foilCounts: Record<string, number> = Object.fromEntries(
    POKEMON_FOIL_NAMES.map((name) => [name, 0]),
  );
  const unmappedSamples: Array<{
    bundle: string;
    variant: VariantKey;
    foil: string;
    shader: string;
  }> = [];
  let variants = 0;
  let withMask = 0;
  let emptyMask = 0;
  let missingMasks = 0;
  const missingMaskSamples: Array<{ bundle: string; maskTex: string }> = [];

  for (const [bundleId, entry] of Object.entries(cards)) {
    for (const variantKey of ["std", "ph"] as const) {
      const variant = entry[variantKey];
      if (!variant) continue;
      variants += 1;
      const mapped =
        foilManifestToShader(variant.shader) ||
        foilManifestToShader(variant.foil);
      if (mapped) {
        foilCounts[mapped] = (foilCounts[mapped] ?? 0) + 1;
      } else if (unmappedSamples.length < 30) {
        unmappedSamples.push({
          bundle: bundleId,
          variant: variantKey,
          foil: variant.foil ?? "",
          shader: variant.shader ?? "",
        });
      }

      const maskTex = variant.maskTex?.trim() ?? "";
      if (!maskTex) {
        emptyMask += 1;
        continue;
      }
      withMask += 1;
      if (!existsSync(maskPath(bundleId, maskTex))) {
        missingMasks += 1;
        if (missingMaskSamples.length < 30) {
          missingMaskSamples.push({ bundle: bundleId, maskTex });
        }
      }
    }
  }

  const foilsWithoutDump = POKEMON_FOIL_NAMES.filter(
    (name) => (foilCounts[name] ?? 0) === 0,
  );
  const sharedCount = existsSync(sharedDir)
    ? readdirSync(sharedDir).filter((name) => !name.startsWith(".")).length
    : 0;
  const unmappedCount = Object.values(cards).reduce((acc, entry) => {
    let n = 0;
    for (const variantKey of ["std", "ph"] as const) {
      const variant = entry[variantKey];
      if (!variant) continue;
      const mapped =
        foilManifestToShader(variant.shader) ||
        foilManifestToShader(variant.foil);
      if (!mapped) n += 1;
    }
    return acc + n;
  }, 0);

  const report = {
    finishedAt: new Date().toISOString(),
    packRoot: "data/pokemon/foil",
    cardsPath: "src/effects/pokemon/cards.json",
    bundleCount: Object.keys(cards).length,
    variantCount: variants,
    shaderLeafCount: POKEMON_FOIL_NAMES.length,
    fragCount: frags.size,
    missingFrags,
    extraFrags,
    foilCounts,
    foilsWithoutDump,
    unmappedFoilCount: unmappedCount,
    unmappedSamples,
    maskRefs: withMask,
    emptyMaskCount: emptyMask,
    missingMaskCount: missingMasks,
    missingMaskSamples,
    sharedTextureCount: sharedCount,
    hasFullFoilMask:
      existsSync(path.join(PACK_ROOT, "full_foil_mask.webp")) ||
      existsSync(path.join(PACK_ROOT, "full_foil_mask.png")),
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Store: bundles=${report.bundleCount} variants=${variants} frags=${frags.size}/${POKEMON_FOIL_NAMES.length}`,
  );
  console.log(
    `Foils mapped: unmapped=${unmappedCount}, emptyMask=${emptyMask}, missingMaskFiles=${missingMasks}, shared=${sharedCount}`,
  );
  if (missingFrags.length) {
    console.log(`  Missing .frag: ${missingFrags.join(", ")}`);
  }
  if (foilsWithoutDump.length) {
    console.log(`  Foil leaves with zero cards.json rows: ${foilsWithoutDump.join(", ")}`);
  }
  if (unmappedSamples.length) {
    console.log("  Unmapped foil samples:");
    for (const row of unmappedSamples.slice(0, 8)) {
      console.log(`    ${row.bundle} ${row.variant}: foil=${row.foil} shader=${row.shader}`);
    }
  }
  if (missingMaskSamples.length) {
    console.log("  Missing mask samples:");
    for (const row of missingMaskSamples.slice(0, 8)) {
      console.log(`    ${row.bundle} → ${row.maskTex}`);
    }
  }
  console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);

  const hardFail =
    missingFrags.length > 0 ||
    unmappedCount > 0 ||
    missingMasks > 0 ||
    !report.hasFullFoilMask;
  if (strict && (hardFail || foilsWithoutDump.length > 0 || sharedCount === 0)) {
    process.exitCode = 2;
  } else if (hardFail) {
    process.exitCode = 2;
  }
}

main();
