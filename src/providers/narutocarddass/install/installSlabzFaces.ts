/**
 * Install pasted slab-z.com scans as `art.slabz.*`.
 * Source of truth: `curated/sources/slab-z-ja.json` faces.cards[].
 * Do not crawl the blog — media IDs were pasted; CDN URL is deterministic.
 */
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import {
  slabzFaceUrl,
  slabzIngestFaces,
} from "../sources/slabzFaces";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const REFERER =
  "https://www.slab-z.com/post/the-definitive-2002-naruto-card-game-vintage-guide-rookies-grails";

export type InstallSlabzFacesOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installSlabzFaces(
  options: InstallSlabzFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const row of slabzIngestFaces()) {
    const diskId = row.disk.trim().toLowerCase();
    const lang = "ja";
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (!options.force && existingNarutoArtForSource(cardDir, "slabz")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(slabzFaceUrl(row.media));
    if (!buf) {
      failed.push(key);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "slabz",
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
