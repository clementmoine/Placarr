/**
 * Install pasted eBay Data Carddass scans as `art.ebay.*`.
 * Disk: `cards/{set}/ja/{number}/` — local TCG layout, not Carddass family folders.
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
import { packCardDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import type { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  dataCarddassPrintKey,
  parseDataCarddassPrinted,
} from "../printKey";
import { NARUTO_DATA_CARDDASS_PACK_ID } from "../pack";
import {
  dataCarddassEbayIngestFaces,
  dataCarddassEbayListingImageFull,
} from "../sources/ebayFaces";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const DATA_CARDDASS_TITLE_LANG = "ja";

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

function existingEbayArt(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  const hit = readdirSync(cardDir).find((name) =>
    /^art\.ebay\./i.test(name),
  );
  return hit ?? null;
}

function writeEbayArt(cardDir: string, buf: Buffer): string {
  const ext = extFromMagic(buf);
  const destName = `art.ebay${ext === ".bin" ? ".bin" : ext}`;
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (/^art\.ebay\./i.test(name) && name !== destName) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://www.ebay.fr/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}

export type InstallDataCarddassEbayFacesOptions = {
  packRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
};

export async function installDataCarddassEbayFaces(
  options: InstallDataCarddassEbayFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl?: string;
  }> = [];

  for (const row of dataCarddassEbayIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printedRef);
    if (!parsed) {
      failed.push(row.printedRef);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = (row.lang || DATA_CARDDASS_TITLE_LANG).toLowerCase();
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang,
      card: parsed.number,
    });
    const key = `${parsed.set}/${lang}/${parsed.number}`;
    if (!options.force && existingEbayArt(cardDir)) {
      const art = existingEbayArt(cardDir)!;
      assets.push({ printKey, lang, art, sourceUrl: row.url });
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(
      dataCarddassEbayListingImageFull(row.url),
    );
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (row.staging) {
      const staging = path.join(packRoot, row.staging);
      mkdirSync(path.dirname(staging), { recursive: true });
      writeFileSync(staging, buf);
    }
    const art = writeEbayArt(cardDir, buf);
    assets.push({ printKey, lang, art, sourceUrl: row.url });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}
