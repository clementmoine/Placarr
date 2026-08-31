/**
 * Install pasted Leboncoin card photos as `art.leboncoin.*`.
 * Source of truth: `curated/sources/leboncoin.json` faces[].
 * Do not crawl listings or seller stores — only URLs in the ledger.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import ledger from "../curated/sources/leboncoin.json";
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
const REFERER = "https://www.leboncoin.fr/";

export type LeboncoinFace = (typeof ledger.faces)[number];

export function leboncoinFaceLedger() {
  return ledger;
}

export function leboncoinIngestFaces(): LeboncoinFace[] {
  return ledger.faces.filter((row) => row.ingest);
}

/** Prefer `ad-large` (602×800). Bare hash URLs 404. */
export function leboncoinListingImageFull(url: string): string {
  if (/[?&]rule=/.test(url)) {
    return url.replace(/([?&]rule=)[^&]+/, "$1ad-large");
  }
  return `${url}${url.includes("?") ? "&" : "?"}rule=ad-large`;
}

export type InstallLeboncoinFacesOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installLeboncoinFaces(
  options: InstallLeboncoinFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const row of leboncoinIngestFaces()) {
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
    if (row.setCode) {
      upsertNarutoAppearances(packRoot, [
        { diskId, lang, appearanceSet: row.setCode },
      ]);
    }
    if (!options.force && existingNarutoArtForSource(cardDir, "leboncoin")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(leboncoinListingImageFull(row.url));
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
      source: "leboncoin",
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
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
