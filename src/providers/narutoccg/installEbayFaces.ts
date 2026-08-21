/**
 * Install pasted eBay card scans as `art.ebay.*`.
 * Source of truth: `curated/sources/ebay.json` faces[].
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "./collectorIdentity";
import { ebayIngestFaces, ebayListingImageFull } from "./ebayPackshots";
import { upsertNarutoAppearances } from "./migrateCardLayout";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";
import { NARUTO_PACK_ID } from "./packs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallEbayFacesOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installEbayFaces(
  options: InstallEbayFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of ebayIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    // An appearance is a card *in a set*. The 騎 knights have no attested set
    // outside 巻ノ十三, so they record none rather than an invented one.
    if (row.setCode) {
      upsertNarutoAppearances(packRoot, [
        { diskId, lang, appearanceSet: row.setCode },
      ]);
    }
    if (!options.force && existingNarutoArtForSource(cardDir, "ebay")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(ebayListingImageFull(row.url));
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (row.staging) {
      const staging = path.join(packRoot, row.staging);
      mkdirSync(path.dirname(staging), { recursive: true });
      writeFileSync(staging, buf);
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "ebay",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

/**
 * eBay serves `s-l1600` as webp on some listings and jpg on others — the 騎
 * knight scans are jpg. Trust the magic bytes, not the extension: anything the
 * face saver can name is fine, and it is the saver that picks `art.ebay.<ext>`.
 */
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
