/**
 * Install TV Tokyo official Data Carddass scans as `art.tvtokyo.*`.
 * Disk: `cards/{set}/ja/{number}/`.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import type { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  dataCarddassPrintKey,
  parseDataCarddassPrinted,
} from "../printKey";
import { NARUTO_DATA_CARDDASS_PACK_ID } from "../pack";
import { dataCarddassTvTokyoIngestFaces } from "../sources/tvTokyoFaces";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const LANG = "ja";

function extFromMagic(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  if (buf.length >= 6 && buf.subarray(0, 3).toString("ascii") === "GIF") {
    return ".gif";
  }
  return ".bin";
}

function existingTvTokyoArt(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  return readdirSync(cardDir).find((name) => /^art\.tvtokyo\./i.test(name)) ?? null;
}

function writeTvTokyoArt(cardDir: string, buf: Buffer): string {
  const ext = extFromMagic(buf);
  const destName = `art.tvtokyo${ext === ".bin" ? ".bin" : ext}`;
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (/^art\.tvtokyo\./i.test(name) && name !== destName) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.tv-tokyo.co.jp/anime/naruto2002/goods/",
      },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= 2_000 ? buf : null;
  } catch {
    return null;
  }
}

export type InstallDataCarddassTvTokyoFacesOptions = {
  packRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassTvTokyoFaces(
  options: InstallDataCarddassTvTokyoFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "tvtokyo",
  );
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl?: string;
  }> = [];

  for (const row of dataCarddassTvTokyoIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printed);
    if (!parsed) {
      failed.push(row.printed);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printed);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang: LANG,
      card: parsed.number,
    });
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force && existingTvTokyoArt(cardDir)) {
      const art = existingTvTokyoArt(cardDir)!;
      assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(row.url);
    if (!buf) {
      failed.push(key);
      continue;
    }
    const stagingName = `${parsed.set}-${parsed.number}${extFromMagic(buf)}`;
    writeFileSync(path.join(staging, stagingName), buf);
    const art = writeTvTokyoArt(cardDir, buf);
    assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }

  return { written, skipped, failed };
}
