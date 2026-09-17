/**
 * Install Chitoroshop Data Carddass scans as `art.chitoroshop.*`.
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
import { dataCarddassChitoroshopIngestFaces } from "../sources/chitoroshopFaces";

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
  return ".bin";
}

function existingChitoArt(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  return readdirSync(cardDir).find((name) => /^art\.chitoroshop\./i.test(name)) ?? null;
}

function writeChitoArt(cardDir: string, buf: Buffer): string {
  const ext = extFromMagic(buf);
  const destName = `art.chitoroshop${ext === ".bin" ? ".bin" : ext}`;
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (/^art\.chitoroshop\./i.test(name) && name !== destName) {
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
        Referer: "https://chitoroshop.com/",
      },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}

export type InstallDataCarddassChitoroshopFacesOptions = {
  packRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassChitoroshopFaces(
  options: InstallDataCarddassChitoroshopFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "chitoroshop",
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

  for (const row of dataCarddassChitoroshopIngestFaces()) {
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
    if (!options.force && existingChitoArt(cardDir)) {
      const art = existingChitoArt(cardDir)!;
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
    const art = writeChitoArt(cardDir, buf);
    assets.push({ printKey, lang: LANG, art, sourceUrl: row.url });
    written.push(key);
  }

  writeFileSync(
    path.join(staging, "faces.json"),
    `${JSON.stringify(
      {
        source: "chitoroshop",
        packRoot,
        written,
        skipped,
        failed,
      },
      null,
      2,
    )}\n`,
  );

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}
