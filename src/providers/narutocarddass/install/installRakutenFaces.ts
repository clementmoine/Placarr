/**
 * Install pasted Rakuten FR card scans as `art.rakuten.*`.
 * Source of truth: `curated/sources/rakuten.json` faces[].
 * Do not crawl listings or seller stores — only URLs in the ledger.
 */
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { narutoDiskCardId } from "../collectorIdentity";
import { narutoCardAbsDir } from "../narutoCardDisk";
import {
  existingNarutoArtForSource,
  extFromMagic,
  saveNarutoFace,
} from "../narutoFaceBytes";
import { NARUTO_PACK_ID } from "../packs";
import { rakutenIngestFaces } from "../sources/rakutenPackshots";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const REFERER = "https://fr.shopping.rakuten.com/";

export type InstallRakutenFacesOptions = {
  packRoot?: string;
  force?: boolean;
};

function diskIdOf(row: {
  diskId?: string | null;
  printedRef?: string | null;
}): string | null {
  const fromDisk = String(row.diskId ?? "").trim().toLowerCase();
  if (fromDisk) return fromDisk;
  const printed = String(row.printedRef ?? "").trim();
  return printed ? narutoDiskCardId(printed) : null;
}

export async function installRakutenFaces(
  options: InstallRakutenFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(packRoot, "cards");
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const row of rakutenIngestFaces()) {
    const diskId = diskIdOf(row);
    if (!diskId) {
      failed.push(String(row.printedRef ?? row.url));
      continue;
    }
    const lang = String(row.lang ?? "fr").toLowerCase();
    const cardDir =
      narutoCardAbsDir(cardsDir, diskId, lang) ??
      path.join(cardsDir, "ninja", diskId, lang);
    const key = `${diskId}/${lang}`;
    if (!options.force && existingNarutoArtForSource(cardDir, "rakuten")) {
      skipped.push(key);
      continue;
    }
    const buf = await downloadImage(row.url);
    if (!buf) {
      failed.push(key);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "rakuten",
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
    return buf.byteLength >= 4_000 ? buf : null;
  } catch {
    return null;
  }
}
