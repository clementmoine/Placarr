/**
 * Install pasted Goat locale promo faces as `art.goat.*`.
 * Source of truth: `curated/sources/goat-locale-promos.json` faces[].
 * Do not crawl the shop — only CDN URLs in the ledger.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import ledger from "../curated/sources/goat-locale-promos.json";
import { upsertNarutoAppearances } from "../migrateCardLayout";
import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const REFERER = "https://goatcardsshop.crystalcommerce.com/";
const MIN_BYTES = 4_000;

export type GoatLocalePromoFace = (typeof ledger.faces)[number];

export function goatLocalePromoFaceLedger() {
  return ledger;
}

export function goatLocalePromoIngestFaces(): GoatLocalePromoFace[] {
  return ledger.faces.filter((row) => row.ingest);
}

export type InstallGoatLocalePromoFacesOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installGoatLocalePromoFaces(
  options: InstallGoatLocalePromoFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of goatLocalePromoIngestFaces()) {
    const diskId = narutoDiskCardId(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const lang = row.lang.toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang, row.setCode) ??
      path.join(cardsDir, "promo", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (row.setCode) {
      upsertNarutoAppearances(packRoot, [
        { diskId, lang, appearanceSet: row.setCode },
      ]);
    }
    if (!options.force && existingNarutoArtForSource(cardDir, "goat")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(row.url);
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
      source: "goat",
      lang,
      force: options.force,
    });
    if (saved === "skip") skipped.push(key);
    else written.push(key);
  }
  return { written, skipped, failed };
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: REFERER },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}
