/**
 * Moisson et découpe des planches Imadoki.
 *
 * `harvest` descend les planches dans le staging ; `install` les découpe et
 * pose une face par carte sous `cards/{set}/it/{numéro}/art.imadoki.jpg`.
 * La grille est détectée sur chaque planche, jamais codée en dur — voir
 * `parseImadokiSheets`. Chaque case est ensuite recadrée avec
 * `trimLightImageMargins` pour retirer les marges blanches internes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { trimLightImageMargins } from "@/core/enrich/media/imageTrim";
import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  IMADOKI_LANG,
  IMADOKI_SHEETS,
  IMADOKI_SOURCE_ID,
  imadokiGalleryUrl,
  imadokiSheetUrl,
  splitAxis,
  type ImadokiSheet,
} from "./parseImadokiSheets";
import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID } from "./pack";

const STAGING_FOLDER = "imadoki";

/** Bandes égales quand la planche n'a pas de gouttières (NS paysage). */
function equalAxis(size: number, parts: number): [number, number][] {
  const cell = Math.floor(size / parts);
  const cuts: [number, number][] = [];
  for (let i = 0; i < parts; i += 1) {
    const start = i * cell;
    const end = i === parts - 1 ? size : start + cell;
    cuts.push([start, end]);
  }
  return cuts;
}

function sheetGrid(
  sheet: ImadokiSheet,
  colWhite: number[],
  rowWhite: number[],
  width: number,
  height: number,
): { cols: [number, number][]; rows: [number, number][] } | null {
  if (sheet.gridMode === "equal") {
    return {
      cols: equalAxis(width, sheet.columns),
      rows: equalAxis(height, sheet.rows),
    };
  }
  const cols = splitAxis(
    colWhite.map((v) => v / height),
    sheet.columns,
  );
  const rows = splitAxis(
    rowWhite.map((v) => v / width),
    sheet.rows,
  );
  if (cols && rows) return { cols, rows };
  return {
    cols: equalAxis(width, sheet.columns),
    rows: equalAxis(height, sheet.rows),
  };
}
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
/** Au-delà de cette proportion de blanc, la case est un emplacement vide. */
const BLANK_RATIO = 0.97;
/** Scans Imadoki : fond gris clair autour de la carte, pas du blanc pur. */
const IMADOKI_TRIM_LIGHT_LUMINANCE = 220;

export function imadokiStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

export type ImadokiHarvest = { ok: number; skip: number; fail: number };

export async function harvestImadokiSheets(
  opts: { force?: boolean } = {},
): Promise<ImadokiHarvest> {
  const dir = imadokiStagingDir();
  mkdirSync(dir, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const sheet of IMADOKI_SHEETS) {
    const dest = path.join(dir, sheet.file);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    try {
      const res = await httpGet<ArrayBuffer>(imadokiSheetUrl(sheet.file), {
        headers: { "User-Agent": UA, Referer: imadokiGalleryUrl() },
        responseType: "arraybuffer",
        timeout: 40_000,
        validateStatus: (status: number) => status === 200,
      });
      const data = res.data;
      if (!data || data.byteLength < 2_000) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, Buffer.from(data));
      ok += 1;
    } catch {
      fail += 1;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok, skip, fail };
}

export type ImadokiCut = {
  slot: number;
  setCode: string;
  number: string;
  buffer: Buffer;
};

export type ImadokiSheetCut = {
  cuts: ImadokiCut[];
  /** Cases refusées, avec leur raison. */
  rejected: { slot: number; reason: string }[];
};

/**
 * Découpe une planche selon sa grille détectée.
 *
 * Rejette la planche entière si la grille ne se lit pas, et chaque case dont
 * l'emplacement est vide — la planche SD en a un, à la place de `sd-0004`.
 */
export async function cutImadokiSheet(
  bytes: Buffer,
  sheet: ImadokiSheet,
): Promise<ImadokiSheetCut> {
  const image = sharp(bytes);
  const { width, height } = await image.metadata();
  if (!width || !height) {
    return { cuts: [], rejected: [{ slot: -1, reason: "planche illisible" }] };
  }
  const { data } = await image
    .clone()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colWhite: number[] = new Array(width).fill(0);
  const rowWhite: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x]! > 225) {
        colWhite[x] += 1;
        rowWhite[y] += 1;
      }
    }
  }
  const grid = sheetGrid(sheet, colWhite, rowWhite, width, height);
  if (!grid) {
    return {
      cuts: [],
      rejected: [{ slot: -1, reason: "grille illisible" }],
    };
  }
  const { cols, rows } = grid;

  const cuts: ImadokiCut[] = [];
  const rejected: ImadokiSheetCut["rejected"] = [];
  let slot = -1;
  for (const [top, bottom] of rows) {
    for (const [left, right] of cols) {
      slot += 1;
      const target = sheet.slots[slot];
      if (!target) continue;
      let white = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          if (data[y * width + x]! > 225) white += 1;
        }
      }
      const area = (bottom - top) * (right - left);
      if (area <= 0 || white / area > BLANK_RATIO) {
        rejected.push({
          slot,
          reason: "emplacement vide sur la planche — aucune carte à découper",
        });
        continue;
      }
      const extracted = await sharp(bytes)
        .extract({
          left,
          top,
          width: right - left,
          height: bottom - top,
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      const trimmed = await trimLightImageMargins(extracted, {
        lightLuminanceThreshold: IMADOKI_TRIM_LIGHT_LUMINANCE,
      });
      const buffer = await sharp(trimmed).jpeg({ quality: 92 }).toBuffer();
      cuts.push({
        slot,
        setCode: target.setCode,
        number: target.number,
        buffer,
      });
    }
  }
  return { cuts, rejected };
}

export type ImadokiInstall = {
  faces: number;
  sheets: number;
  rejected: { file: string; slot: number; reason: string }[];
};

export async function installImadokiSheets(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): Promise<ImadokiInstall> {
  const dir = opts.stagingDir ?? imadokiStagingDir();
  const rejected: ImadokiInstall["rejected"] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];
  let sheets = 0;

  for (const sheet of IMADOKI_SHEETS) {
    const src = path.join(dir, sheet.file);
    if (!existsSync(src)) continue;
    const { cuts, rejected: bad } = await cutImadokiSheet(
      readFileSync(src),
      sheet,
    );
    for (const row of bad) {
      rejected.push({ file: sheet.file, slot: row.slot, reason: row.reason });
    }
    if (!cuts.length) continue;
    sheets += 1;
    for (const cut of cuts) {
      const printKey = ninjaRanksPrintKey(cut.setCode, cut.number);
      if (!printKey) continue;
      const destDir = path.join(
        packCardsDir(NARUTO_RANKS_PACK_ID),
        cut.setCode,
        IMADOKI_LANG,
        cut.number,
      );
      mkdirSync(destDir, { recursive: true });
      const art = `art.${IMADOKI_SOURCE_ID}.jpg`;
      writeFileSync(path.join(destDir, art), cut.buffer);
      assets.push({
        printKey,
        lang: IMADOKI_LANG,
        art,
        sourceUrl: imadokiSheetUrl(sheet.file),
      });
    }
  }

  if (assets.length) index.writeAssets(assets);
  return { faces: assets.length, sheets, rejected };
}
