/**
 * Foil gap audit — dump/data vs ported looks / motifs (admin foil-status).
 */

import "@/lib/foilMetaLoad.server";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { POKEMON_HOLO_SHADER_IDS } from "@/core/render/holoShadersPokemon";
import { SIMEY_HOLO_SHADER_IDS } from "@/core/render/holoShadersSimey";
import {
  isCssFinishFallbackOnly as isLorcanaCssFinishFallbackOnly,
  isCssVarnishFallbackOnly as isLorcanaCssVarnishFallbackOnly,
} from "@/effects/lorcana/cssRecipes";
import { isCssFinishFallbackOnly as isPokemonCssFinishFallbackOnly } from "@/effects/pokemon/cssRecipes";
import { listPokemonFoilNames } from "@/effects/pokemon/foilNames";
import {
  POKEMON_MAT_ALIASES,
  sharedMotifStems,
} from "@/effects/pokemon/materials";
import {
  packCardsDir,
  packLogsDir,
  packShadersDir,
  pokemonSimeyCssCardsDir,
} from "@/lib/packPaths";
import { foilPackDir } from "@/lib/runtimeData";
import { lorcanaTcgDbPath } from "@/providers/lorcanatcg/indexStore";

import {
  extraLiveFragStems,
  liveLeavesMissingSharedMotifs,
  lorcanaCatalogueCssGaps,
  lorcanaWebStemGaps,
  simeyCssGaps,
} from "@/lib/admin/foilGapMaps";

export type FoilGapItem = {
  id: string;
  section: string;
  detail: string;
  /** Needs APK / research — see docs/foil_apk_sources.md */
  apkGated?: boolean;
};

export type FoilGapsReport = {
  finishedAt: string;
  docs: string;
  actionableCount: number;
  items: FoilGapItem[];
  pokemonWebgl: {
    dumpFragCount: number;
    knownLeafCount: number;
    extraFrags: string[];
    missingSharedMotifs: string[];
  };
  pokemonCss: {
    fallbackOnlyLeaves: string[];
    simeyUnported: Array<{ tree: string; stem: string; expectedId: string }>;
  };
  lorcanaCss: {
    webDumpStems: string[];
    unlistedFromLastDump: string[];
    /** Catalogue foilTypes that only resolve to pack silver. */
    fallbackOnlyFinishes: string[];
    /** Catalogue varnishType that only resolve to pack hotFoil (non-family). */
    fallbackOnlyVarnishes: string[];
  };
  apkGated: FoilGapItem[];
};

const SIMEY_TREES = [
  { id: "poke-holo" as const, dir: () => pokemonSimeyCssCardsDir("poke-holo") },
  { id: "poke-151" as const, dir: () => pokemonSimeyCssCardsDir("poke-151") },
] as const;

function listFragStems(shadersDir: string): string[] {
  if (!existsSync(shadersDir)) return [];
  return readdirSync(shadersDir)
    .filter((name) => name.endsWith(".frag"))
    .map((name) => name.replace(/\.frag$/i, ""));
}

function listSimeyCssFiles(): Array<{ tree: string; stem: string }> {
  const out: Array<{ tree: string; stem: string }> = [];
  for (const tree of SIMEY_TREES) {
    const dir = tree.dir();
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".css")) continue;
      out.push({ tree: tree.id, stem: name.replace(/\.css$/i, "") });
    }
  }
  return out;
}

function readLorcanaUnlisted(): string[] {
  const sourcePath = path.join(packLogsDir("lorcana"), "web-source.json");
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
  const dir = path.join(foilPackDir("lorcana"), "web");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /\.(jpe?g|png|webp)$/i.test(n))
    .map((n) => n.replace(/\.(jpe?g|png|webp)$/i, "").toLowerCase())
    .sort();
}

function listLorcanaCatalogueFoilMeta(): {
  finishes: string[];
  varnishes: string[];
} {
  const dbPath = lorcanaTcgDbPath();
  if (!existsSync(dbPath)) return { finishes: [], varnishes: [] };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const finishes = new Set<string>();
      const varnishes = new Set<string>();
      const rows = db
        .prepare(
          `SELECT foil_types_json AS foilTypesJson, varnish_type AS varnishType
           FROM prints`,
        )
        .all() as Array<{
        foilTypesJson: string | null;
        varnishType: string | null;
      }>;
      for (const row of rows) {
        if (row.varnishType?.trim()) varnishes.add(row.varnishType.trim());
        if (!row.foilTypesJson) continue;
        try {
          const parsed = JSON.parse(row.foilTypesJson) as unknown;
          if (!Array.isArray(parsed)) continue;
          for (const item of parsed) {
            if (typeof item === "string" && item.trim()) {
              finishes.add(item.trim());
            }
          }
        } catch {
          /* ignore bad row */
        }
      }
      return {
        finishes: [...finishes].sort(),
        varnishes: [...varnishes].sort(),
      };
    } finally {
      db.close();
    }
  } catch {
    return { finishes: [], varnishes: [] };
  }
}

function apkGatedItems(): FoilGapItem[] {
  const items: FoilGapItem[] = [];
  const pokeBack = path.join(packCardsDir("pokemon"), "back.webp");
  const pokeUv = path.join(foilPackDir("pokemon"), "card-uv-rect.json");
  if (!existsSync(pokeBack)) {
    items.push({
      id: "pokemon-back",
      section: "apk-gated",
      detail: "data/pokemon/cards/back.webp missing — APK or CDN hunt",
      apkGated: true,
    });
  }
  if (!existsSync(pokeUv)) {
    items.push({
      id: "pokemon-uv",
      section: "apk-gated",
      detail: "data/pokemon/foil/card-uv-rect.json missing — pin or APK mesh",
      apkGated: true,
    });
  }
  const lorcanaManifest = path.join(foilPackDir("lorcana"), "manifest.json");
  const lorcanaShaders = packShadersDir("lorcana");
  const hasLorcanaWebgl =
    existsSync(lorcanaManifest) &&
    existsSync(lorcanaShaders) &&
    listFragStems(lorcanaShaders).length > 0;
  if (!hasLorcanaWebgl) {
    items.push({
      id: "lorcana-webgl",
      section: "apk-gated",
      detail: "Lorcana WebGL dump missing — APK one-shot (analyse CDN ouverte)",
      apkGated: true,
    });
  }
  return items;
}

/** Compute foil integration gaps from on-disk dump + ported registries. */
export function computeFoilGaps(): FoilGapsReport {
  const dumpFrags = listFragStems(packShadersDir("pokemon"));
  const foilNames = listPokemonFoilNames();
  const sheetAliases = Object.keys(POKEMON_MAT_ALIASES);

  const missingSharedMotifs = liveLeavesMissingSharedMotifs({
    foilNames,
    sheetAliases,
    hasShared: (name) => Object.keys(sharedMotifStems(name)).length > 0,
  });

  // New frags on disk that longest-first list already includes → empty extras
  // when names come from disk. Still report frags with no motif map.
  const extraFrags = extraLiveFragStems(dumpFrags, foilNames);

  const fallbackOnlyLeaves = foilNames
    .filter((n) => n !== "NonFoil")
    .filter((n) => isPokemonCssFinishFallbackOnly(n));

  const simeyUnported = simeyCssGaps({
    files: listSimeyCssFiles(),
    portedIds: new Set<string>([
      ...SIMEY_HOLO_SHADER_IDS,
      ...POKEMON_HOLO_SHADER_IDS,
    ]),
  });

  const onDisk = webDumpStemsOnDisk();
  const unlistedFromLastDump = lorcanaWebStemGaps({
    unlistedStems: readLorcanaUnlisted(),
  });
  const catalogue = listLorcanaCatalogueFoilMeta();
  const catalogueCss = lorcanaCatalogueCssGaps({
    finishes: catalogue.finishes,
    varnishes: catalogue.varnishes,
    isFinishFallbackOnly: isLorcanaCssFinishFallbackOnly,
    isVarnishFallbackOnly: isLorcanaCssVarnishFallbackOnly,
  });

  const apkGated = apkGatedItems();

  const items: FoilGapItem[] = [
    ...extraFrags.map((f) => ({
      id: `frag-${f}`,
      section: "pokemon-webgl-extra-frag",
      detail: f,
    })),
    ...missingSharedMotifs.map((f) => ({
      id: `motif-${f}`,
      section: "pokemon-webgl-missing-motifs",
      detail: f,
    })),
    ...fallbackOnlyLeaves.map((f) => ({
      id: `css-${f}`,
      section: "pokemon-css-fallback",
      detail: `${f} → pack default only — port look or alias`,
    })),
    ...simeyUnported.map((g) => ({
      id: `simey-${g.tree}-${g.stem}`,
      section: "simey-unported",
      detail: `${g.tree}/${g.stem}.css → expect ${g.expectedId}`,
    })),
    ...catalogueCss.finishes.map((f) => ({
      id: `lorcana-finish-${f}`,
      section: "lorcana-css-finish-fallback",
      detail: `${f} → silver only — port look or alias`,
    })),
    ...catalogueCss.varnishes.map((v) => ({
      id: `lorcana-varnish-${v}`,
      section: "lorcana-css-varnish-fallback",
      detail: `${v} → hotFoil only — port look or alias`,
    })),
    ...unlistedFromLastDump.map((s) => ({
      id: `lorcana-web-${s}`,
      section: "lorcana-web-stem",
      detail: `${s} — new web texture? (not chrome, not recipe stem)`,
    })),
    ...apkGated,
  ];

  return {
    finishedAt: new Date().toISOString(),
    docs: "docs/foil_new_finish.md",
    actionableCount: items.filter((i) => !i.apkGated).length + apkGated.length,
    items,
    pokemonWebgl: {
      dumpFragCount: dumpFrags.length,
      knownLeafCount: foilNames.length,
      extraFrags,
      missingSharedMotifs,
    },
    pokemonCss: {
      fallbackOnlyLeaves,
      simeyUnported,
    },
    lorcanaCss: {
      webDumpStems: onDisk,
      unlistedFromLastDump,
      fallbackOnlyFinishes: catalogueCss.finishes,
      fallbackOnlyVarnishes: catalogueCss.varnishes,
    },
    apkGated,
  };
}
