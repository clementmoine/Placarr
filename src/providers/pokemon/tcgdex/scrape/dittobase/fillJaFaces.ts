/**
 * Dittobase Japanese paper faces → `art.dittobase.webp`.
 *
 * CDN uses JA collector order: `assets.dittobase.com/tcg/cards/ja/{folder}/{localId}.webp`.
 * Only sets with a verified folder (neo*, VS1, E2–E5, …) — never invent EN-order
 * bindings. Probe returns bytes or skip; 403/404 → unmapped/failed honestly.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
  resolvePokemonArtFilename,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import {
  syncTcgdexPrintAssetsFromDisk,
  tcgdexDbPath,
} from "../../indexStore";

const DITTOBASE_ORIGIN = "https://www.dittobase.com";
const DITTOBASE_CARDS = "https://assets.dittobase.com/tcg/cards/ja";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * TCGdex JA set id → dittobase CDN folder (case-sensitive on the CDN).
 * Only folders that returned real card webps in probes.
 */
export const DITTOBASE_JA_SETS: Readonly<Record<string, string>> = {
  neo1: "neo1",
  neo2: "neo2",
  neo3: "neo3",
  neo4: "neo4",
  /** Pokémon VS — folder is uppercase on the CDN. */
  vs1: "VS1",
  /** Base Expansion Pack successors — `E1`/`web1` not hosted (403). */
  e2: "E2",
};

export type DittobaseJaFillReport = {
  prints: number;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  unmapped: number;
  assetsSynced: number;
};

export type DittobasePrintTarget = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
};

/** Pad numeric local ids to the 3-digit stems dittobase hosts. */
export function dittobaseLocalIdStem(localId: string): string | null {
  const raw = localId.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return String(Number.parseInt(raw, 10)).padStart(3, "0");
  }
  return null;
}

export function dittobaseJaFaceUrl(folder: string, localId: string): string | null {
  const stem = dittobaseLocalIdStem(localId);
  if (!stem) return null;
  return `${DITTOBASE_CARDS}/${folder}/${stem}.webp`;
}

function existingDittobaseArt(cardDir: string): string | null {
  for (const ext of ["webp", "png", "jpg"] as const) {
    const name = pokemonFaceFilename("dittobase", "art", ext);
    if (existsSync(path.join(cardDir, name))) return name;
  }
  return null;
}

async function downloadDittobaseFace(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${DITTOBASE_ORIGIN}/`,
        Accept: "image/webp,image/*,*/*",
      },
      responseType: "arraybuffer",
      timeout: 20_000,
      minIntervalMs: 0,
      noDedup: true,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 1000) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export function listDittobaseJaPrintTargets(opts?: {
  dbPath?: string;
  setIds?: readonly string[];
}): DittobasePrintTarget[] {
  const pathToDb = opts?.dbPath ?? tcgdexDbPath();
  if (!existsSync(pathToDb)) return [];
  const setIds = opts?.setIds ?? Object.keys(DITTOBASE_JA_SETS);
  if (setIds.length === 0) return [];
  const db = new DatabaseSync(pathToDb, { readOnly: true });
  try {
    const placeholders = setIds.map(() => "?").join(", ");
    return db
      .prepare(
        `
      SELECT p.print_key AS printKey,
             p.set_id AS setId,
             p.local_id AS localId,
             p.provider_id AS providerId
        FROM prints p
        JOIN print_titles t ON t.print_key = p.print_key AND t.lang = 'ja'
       WHERE p.set_id IN (${placeholders})
         AND COALESCE(p.printed, 1) != 0
       ORDER BY LOWER(p.set_id), CAST(p.local_id AS INTEGER), p.local_id
    `,
      )
      .all(...setIds) as DittobasePrintTarget[];
  } finally {
    db.close();
  }
}

/**
 * Download dittobase JA faces for mapped vintage sets. Skip when any face
 * already exists (unless `force`).
 */
export async function fillDittobaseJaFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    prints?: readonly DittobasePrintTarget[];
    downloadImage?: (url: string) => Promise<Buffer | null>;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<DittobaseJaFillReport> {
  const prints = opts.prints ?? listDittobaseJaPrintTargets();
  const report: DittobaseJaFillReport = {
    prints: prints.length,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    unmapped: 0,
    assetsSynced: 0,
  };
  if (prints.length === 0) return report;

  const downloadImage = opts.downloadImage ?? downloadDittobaseFace;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 12));
  const writtenKeys: string[] = [];
  let cursor = 0;
  let done = 0;

  async function runOne(
    row: DittobasePrintTarget,
  ): Promise<"written" | "skipped" | "failed" | "unmapped"> {
    const folder = DITTOBASE_JA_SETS[row.setId];
    if (!folder) return "unmapped";

    const cardDir = pokemonPaperCardDir({
      setId: row.setId,
      lang: "ja",
      localId: row.localId,
      cardsRoot: opts.cardsRoot,
    });
    if (!opts.force) {
      if (
        existingDittobaseArt(cardDir) ||
        resolvePokemonArtFilename(cardDir, "ja")
      ) {
        refreshPokemonFaceDecision(cardDir, "ja");
        return "skipped";
      }
    }

    const url = dittobaseJaFaceUrl(folder, row.localId);
    if (!url) return "unmapped";

    const buf = await downloadImage(url);
    if (!buf) return "failed";

    mkdirSync(cardDir, { recursive: true });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("dittobase", "art", "webp"),
    );
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, "ja");
    writtenKeys.push(row.printKey);
    return "written";
  }

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= prints.length) return;
      const outcome = await runOne(prints[idx]!);
      report.tried += 1;
      if (outcome === "written") report.written += 1;
      else if (outcome === "skipped") report.skipped += 1;
      else if (outcome === "unmapped") report.unmapped += 1;
      else report.failed += 1;
      done += 1;
      opts.onProgress?.(done, prints.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, prints.length) }, () =>
      worker(),
    ),
  );

  if (writtenKeys.length > 0 && !opts.cardsRoot) {
    report.assetsSynced = syncTcgdexPrintAssetsFromDisk({
      printKeys: writtenKeys,
      languages: ["ja"],
    });
  }

  return report;
}
