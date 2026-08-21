/**
 * Six S5 faces that carddass.fr CDX never crawled. Ultrajeux copied the
 * official scans under `/images/naruto/scan/normal/vf/serie_5/`.
 * Do not dump the rest of that folder — those are already `art.carddass`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import ledger from "./curated/sources/ultrajeux-s5.json";
import { NARUTO_PACK_ID } from "./packs";
import { narutoCardAbsDir } from "./narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "./narutoFaceBytes";

const LANG = "fr";
const MIN_BYTES = 4_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const NARUTO_STAGING_ULTRAJEUX = path.join("staging", "ultrajeux");

export type ScrapeUltrajeuxS5Options = {
  force?: boolean;
  root?: string;
};

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function ultrajeuxWaybackUrl(file: string, timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${ledger.waybackHost}${file}`;
}

async function downloadJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
      },
      responseType: "arraybuffer",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) !== ".jpg") return null;
    return buf.byteLength >= MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeUltrajeuxS5Holes(
  opts: ScrapeUltrajeuxS5Options = {},
): Promise<{ downloaded: number; skipped: number; failed: string[] }> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const staging = path.join(root, NARUTO_STAGING_ULTRAJEUX, "serie_5");
  mkdirSync(staging, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  const failed: string[] = [];

  console.log("── Ultrajeux S5 holes → art.ultrajeux");
  for (const hole of ledger.holes) {
    const cardDir = narutoCardAbsDir(cardsDir, hole.number, LANG);
    if (!cardDir) {
      failed.push(hole.number);
      continue;
    }
    if (!opts.force && existingNarutoArtForSource(cardDir, "ultrajeux")) {
      skipped += 1;
      continue;
    }
    const url = ultrajeuxWaybackUrl(hole.file, hole.timestamp);
    const buf = await downloadJpeg(url);
    if (!buf) {
      failed.push(hole.number);
      console.log(`Ultrajeux ${hole.number} FAIL`);
      continue;
    }
    writeFileSync(path.join(staging, hole.file), buf);
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "ultrajeux",
      lang: LANG,
      force: opts.force,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
  }
  console.log(
    JSON.stringify({
      ultrajeuxS5: true,
      downloaded,
      skipped,
      failed,
    }),
  );
  return { downloaded, skipped, failed };
}
