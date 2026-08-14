/**
 * TCG Arena / Deckplanet English dump → `data/dbs/cg/cards/{set}/en/{card}/`.
 *
 * The bytes already live in
 * https://github.com/vitorjcorreia/Dragon-Ball-Masters-Arena
 * (`assets/{SET}/{collector}.webp`). Clone that into pack staging, then file
 * each English face. Leader `_b.webp` is the awakened verso of the same print
 * — `awakened.webp` in the card folder, never the pack sleeve.
 *
 * HTTP Deckplanet stays a gap-filler in `fetchFaces` for English prints the
 * clone does not hold.
 */
import {
  copyFileSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { dataPackPath } from "@/providers/shared/catalogCorpus";

import {
  dbsFaceFilename,
  dbsFaceSourceOf,
  recordFaceDecision,
} from "./faceChoice";
import { promoteBestFace } from "./fetchFaces";
import {
  DBS_CG_PACK_ID,
  dbsCgCardFolder,
  exportDbsCgCardsIndexJson,
  loadDbsCgIndex,
} from "./indexStore";
import {
  formatDbsCollectorNumber,
  parseDbsCollectorNumber,
} from "./printIdentity";

export const DBS_CG_ARENA_REPO =
  "https://github.com/vitorjcorreia/Dragon-Ball-Masters-Arena.git";
export const DBS_CG_ARENA_STAGING_NAME = "dragon-ball-masters-arena";

const LANG = "en";
const CLONE_TIMEOUT_MS = 60 * 60 * 1000;

export type ArenaFaceRole = "art" | "back";

export type ArenaFace = {
  filename: string;
  absPath: string;
  collector: string;
  set: string;
  number: string;
  grouping: string | null;
  role: ArenaFaceRole;
};

export function arenaStagingDir(): string {
  return path.join(packStagingDir(DBS_CG_PACK_ID), DBS_CG_ARENA_STAGING_NAME);
}

export function arenaAssetsDir(root = arenaStagingDir()): string {
  return path.join(root, "assets");
}

/**
 * `BT1-001.webp` → art; `BT1-001_b.webp` → awakened. `_SPR` is grouping, `_b`
 * is the Leader verso — strip the verso marker before parsing the collector.
 */
export function parseArenaFaceFilename(
  filename: string,
): Omit<ArenaFace, "absPath"> | null {
  if (!filename.toLowerCase().endsWith(".webp")) return null;
  const stem = filename.slice(0, -".webp".length);
  const awakened = /_b$/i.test(stem);
  const collectorStem = awakened ? stem.replace(/_b$/i, "") : stem;
  const parsed = parseDbsCollectorNumber(collectorStem);
  if (!parsed) return null;
  return {
    filename,
    collector: formatDbsCollectorNumber(
      parsed.set,
      parsed.number,
      parsed.grouping,
    ),
    set: parsed.set,
    number: parsed.number,
    grouping: parsed.grouping,
    role: awakened ? "back" : "art",
  };
}

export function listArenaFaces(assetsDir: string): ArenaFace[] {
  const out: ArenaFace[] = [];
  walkWebp(assetsDir, (absPath, filename) => {
    const parsed = parseArenaFaceFilename(filename);
    if (!parsed) return;
    out.push({ ...parsed, absPath });
  });
  out.sort((a, b) => a.absPath.localeCompare(b.absPath));
  return out;
}

function walkWebp(
  dir: string,
  visit: (absPath: string, filename: string) => void,
): void {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkWebp(absPath, visit);
      continue;
    }
    if (!entry.isFile()) continue;
    visit(absPath, entry.name);
  }
}

function copyCoW(src: string, dest: string): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  try {
    copyFileSync(src, dest, constants.COPYFILE_FICLONE);
  } catch {
    copyFileSync(src, dest);
  }
}

/**
 * Most Arena cards only hold Deckplanet. Ranking via sharp is for folders that
 * already have Bandai/dbscards too.
 */
async function promoteArenaCard(cardDir: string): Promise<void> {
  const deckplanet = path.join(cardDir, dbsFaceFilename("deckplanet"));
  if (!existsSync(deckplanet)) return;
  let names: string[] = [];
  try {
    names = readdirSync(cardDir);
  } catch {
    return;
  }
  const sources = names.filter((name) => dbsFaceSourceOf(name));
  if (sources.length <= 1) {
    // Only one source: no ranking to run, just name it.
    recordFaceDecision(cardDir, "art", dbsFaceFilename("deckplanet"));
    return;
  }
  // Arena only fills the English column.
  await promoteBestFace(cardDir, LANG);
}

function runGit(args: string[]): void {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
    timeout: CLONE_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (status ${result.status})`);
  }
}

export type EnsureArenaCloneOptions = {
  /** Skip git; succeed only if `assets/` is already on disk. */
  offline?: boolean;
};

export function ensureArenaClone(opts: EnsureArenaCloneOptions = {}): boolean {
  const dest = arenaStagingDir();
  const assets = arenaAssetsDir(dest);
  if (opts.offline) {
    if (existsSync(assets)) return true;
    console.warn(
      `── arena : pas de clone sous ${dest} (relancer sans --offline)`,
    );
    return false;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(path.join(dest, ".git"))) {
    console.log("── arena : git fetch (dump TCG Arena)");
    try {
      runGit(["-C", dest, "fetch", "--depth", "1", "origin"]);
      runGit(["-C", dest, "reset", "--hard", "FETCH_HEAD"]);
    } catch (error) {
      console.warn(
        `── arena : fetch ignoré, on range le clone déjà là (${error instanceof Error ? error.message : error})`,
      );
    }
    return existsSync(assets);
  }
  if (existsSync(assets)) {
    console.log("── arena : dump local sans .git, on range tel quel");
    return true;
  }
  console.log(`── arena : git clone --depth 1 ${DBS_CG_ARENA_REPO}`);
  runGit(["clone", "--depth", "1", DBS_CG_ARENA_REPO, dest]);
  return existsSync(assets);
}

export type InstallArenaFacesOptions = {
  force?: boolean;
  /** First N *art* files (debug). Awakened of those prints still install. */
  limit?: number;
  /** Tests: skip the default staging path. */
  assetsDir?: string;
};

export type InstallArenaFacesResult = {
  ok: number;
  skip: number;
  backs: number;
  total: number;
};

export async function installArenaFaces(
  opts: InstallArenaFacesOptions = {},
): Promise<InstallArenaFacesResult> {
  const assetsDir = opts.assetsDir ?? arenaAssetsDir();
  const faces = listArenaFaces(assetsDir);
  const artFaces = faces.filter((face) => face.role === "art");
  const keepArt =
    opts.limit && opts.limit > 0 ? artFaces.slice(0, opts.limit) : artFaces;
  const keepKeys = new Set(
    keepArt.map((face) => `${face.set}:${face.number}:${face.grouping ?? ""}`),
  );
  const selected = faces.filter((face) =>
    keepKeys.has(`${face.set}:${face.number}:${face.grouping ?? ""}`),
  );

  const stats: InstallArenaFacesResult = {
    ok: 0,
    skip: 0,
    backs: 0,
    total: selected.length,
  };
  console.log(
    `── arena : ranger ${keepArt.length} faces EN (+ verso Leader) → cards/{set}/en/`,
  );

  const cardDirs = new Set<string>();
  for (const face of selected) {
    const cardDir = packCardDir(DBS_CG_PACK_ID, {
      set: face.set,
      lang: LANG,
      card: dbsCgCardFolder(face),
    });
    const dest =
      face.role === "back"
        ? path.join(cardDir, dbsFaceFilename("deckplanet", "back"))
        : path.join(cardDir, dbsFaceFilename("deckplanet"));
    if (!opts.force && existsSync(dest)) {
      stats.skip += 1;
      if (face.role === "art") cardDirs.add(cardDir);
      continue;
    }
    copyCoW(face.absPath, dest);
    if (face.role === "back") {
      stats.backs += 1;
      recordFaceDecision(
        cardDir,
        "back",
        dbsFaceFilename("deckplanet", "back"),
      );
    } else {
      stats.ok += 1;
      cardDirs.add(cardDir);
    }
  }

  for (const cardDir of cardDirs) {
    await promoteArenaCard(cardDir);
  }

  const loaded = loadDbsCgIndex();
  if (loaded) {
    const indexPath = dataPackPath(DBS_CG_PACK_ID, "cards-index.json");
    exportDbsCgCardsIndexJson(
      loaded.prints,
      loaded.titles,
      loaded.assets,
      indexPath,
    );
    console.log(`── arena index → ${indexPath}`);
  }

  console.log(`── arena ok=${stats.ok} skip=${stats.skip} dos=${stats.backs}`);
  return stats;
}

/** Bytes on disk for logs — clone size, not catalogue size. */
export function arenaDumpBytes(root = arenaStagingDir()): number {
  const assets = arenaAssetsDir(root);
  if (!existsSync(assets)) return 0;
  let total = 0;
  walkWebp(assets, (absPath) => {
    try {
      total += statSync(absPath).size;
    } catch {
      /* ignore */
    }
  });
  return total;
}
