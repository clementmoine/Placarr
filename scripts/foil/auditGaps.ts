/**
 * Foil gap audit — what upstream dumped / vendored that Placarr has not mapped yet.
 *
 *   pnpm foil:audit-gaps
 *   pnpm foil:audit-gaps -- --strict
 *
 * Surfaces:
 *   Pokémon WebGL  — dump `.frag` ∉ POKEMON_FOIL_NAMES ; missing SHARED_BY_FOIL
 *   Pokémon CSS    — Live leaf ∉ LIVE_FINISH_CSS ; simey CSS file ∉ HoloShader ids
 *   Lorcana CSS    — `web/source.json` unlistedStems (from last dumpWeb)
 *
 * Lorcana WebGL is dump→manifest→score (usually no hand list). Checklist:
 *   docs/foil_new_finish.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { POKEMON_HOLO_SHADER_IDS } from "../../src/core/render/holoShadersPokemon";
import { SIMEY_HOLO_SHADER_IDS } from "../../src/core/render/holoShadersSimey";
import { LIVE_FINISH_CSS } from "../../src/effects/pokemon/cssRecipes";
import { POKEMON_FOIL_NAMES } from "../../src/effects/pokemon/foilNames";
import {
  POKEMON_MAT_ALIASES,
  sharedMotifStems,
} from "../../src/effects/pokemon/materials";
import { FOIL_STEMS } from "../../src/providers/lorcanatcg/dumpWeb";

import {
  extraLiveFragStems,
  liveLeavesMissingCssMap,
  liveLeavesMissingSharedMotifs,
  simeyCssGaps,
} from "./gapMaps";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = path.join(ROOT, "data", "logs", "foil-gaps.json");

const SIMEY_TREES = [
  {
    id: "poke-holo",
    dir: path.join(
      ROOT,
      "third_party",
      "simeydotme-pokemon-cards-css",
      "public",
      "css",
      "cards",
    ),
  },
  {
    id: "poke-151",
    dir: path.join(
      ROOT,
      "third_party",
      "simeydotme-pokemon-cards-151",
      "public",
      "css",
      "cards",
    ),
  },
] as const;

function parseArgs(argv: string[]) {
  let strict = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--strict") strict = true;
  }
  return { strict };
}

function listFragStems(shadersDir: string): string[] {
  if (!existsSync(shadersDir)) return [];
  return readdirSync(shadersDir)
    .filter((name) => name.endsWith(".frag"))
    .map((name) => name.replace(/\.frag$/i, ""));
}

function listSimeyCssFiles(): Array<{ tree: string; stem: string }> {
  const out: Array<{ tree: string; stem: string }> = [];
  for (const tree of SIMEY_TREES) {
    if (!existsSync(tree.dir)) continue;
    for (const name of readdirSync(tree.dir)) {
      if (!name.endsWith(".css")) continue;
      out.push({ tree: tree.id, stem: name.replace(/\.css$/i, "") });
    }
  }
  return out;
}

function readLorcanaUnlisted(): string[] {
  const sourcePath = path.join(
    ROOT,
    "data",
    "lorcana",
    "foil",
    "web",
    "source.json",
  );
  if (!existsSync(sourcePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(sourcePath, "utf8")) as {
      unlistedStems?: unknown;
    };
    return Array.isArray(raw.unlistedStems)
      ? raw.unlistedStems.filter((s): s is string => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

function webDumpStemsOnDisk(): string[] {
  const dir = path.join(ROOT, "data", "lorcana", "foil", "web");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
    .map((n) => n.replace(/\.(jpe?g|png|webp)$/i, "").toLowerCase())
    .sort();
}

function main() {
  const { strict } = parseArgs(process.argv.slice(2));
  const shadersDir = path.join(ROOT, "data", "pokemon", "foil", "shaders");
  const dumpFrags = listFragStems(shadersDir);
  const sheetAliases = Object.keys(POKEMON_MAT_ALIASES);

  const pokemonWebgl = {
    dumpFragCount: dumpFrags.length,
    knownLeafCount: POKEMON_FOIL_NAMES.length,
    extraFrags: extraLiveFragStems(dumpFrags, POKEMON_FOIL_NAMES),
    missingSharedMotifs: liveLeavesMissingSharedMotifs({
      foilNames: POKEMON_FOIL_NAMES,
      sheetAliases,
      hasShared: (name) => Object.keys(sharedMotifStems(name)).length > 0,
    }),
  };

  const pokemonCss = {
    missingLiveFinishCss: liveLeavesMissingCssMap({
      foilNames: POKEMON_FOIL_NAMES,
      sheetAliases,
      liveFinishCss: LIVE_FINISH_CSS as Record<string, string>,
    }),
    simeyUnported: simeyCssGaps({
      files: listSimeyCssFiles(),
      portedIds: new Set<string>([
        ...SIMEY_HOLO_SHADER_IDS,
        ...POKEMON_HOLO_SHADER_IDS,
      ]),
    }),
  };

  const onDisk = webDumpStemsOnDisk();
  const lorcanaCss = {
    foilStemAllowlist: [...FOIL_STEMS].sort(),
    webDumpStems: onDisk,
    allowlistedMissingOnDisk: [...FOIL_STEMS]
      .filter((s) => !onDisk.includes(s))
      .sort(),
    unlistedFromLastDump: readLorcanaUnlisted(),
  };

  const report = {
    finishedAt: new Date().toISOString(),
    docs: "docs/foil_new_finish.md",
    pokemonWebgl,
    pokemonCss,
    lorcanaCss,
  };

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const section = (title: string, lines: string[]) => {
    console.log(title);
    if (lines.length === 0) {
      console.log("  (none)");
      return;
    }
    for (const line of lines) console.log(`  ${line}`);
  };

  console.log("Foil gaps — map these, then ship (see docs/foil_new_finish.md)\n");
  section(
    "Pokémon WebGL — dump .frag not in POKEMON_FOIL_NAMES",
    pokemonWebgl.extraFrags,
  );
  section(
    "Pokémon WebGL — foiled leaf missing SHARED_BY_FOIL motifs",
    pokemonWebgl.missingSharedMotifs,
  );
  section(
    "Pokémon CSS — Live leaf missing LIVE_FINISH_CSS row",
    pokemonCss.missingLiveFinishCss,
  );
  section(
    "Pokémon CSS — simey rarity CSS without HoloShader port",
    pokemonCss.simeyUnported.map(
      (g) => `${g.tree}/${g.stem}.css → expect ${g.expectedId}`,
    ),
  );
  section(
    "Lorcana CSS — FOIL_STEMS missing under data/lorcana/foil/web (run dump)",
    lorcanaCss.allowlistedMissingOnDisk,
  );
  section(
    "Lorcana CSS — unlisted stems from last dumpWeb (review → FOIL_STEMS)",
    lorcanaCss.unlistedFromLastDump,
  );
  console.log(`\nReport: ${path.relative(ROOT, REPORT_PATH)}`);

  const actionable =
    pokemonWebgl.extraFrags.length +
    pokemonWebgl.missingSharedMotifs.length +
    pokemonCss.missingLiveFinishCss.length +
    pokemonCss.simeyUnported.length +
    lorcanaCss.unlistedFromLastDump.length;

  if (strict && actionable > 0) {
    process.exitCode = 2;
  } else if (
    pokemonWebgl.extraFrags.length > 0 ||
    pokemonCss.missingLiveFinishCss.length > 0
  ) {
    // Soft signal even without --strict: new Live leaf without maps is a ship risk.
    process.exitCode = 0;
  }
}

main();
