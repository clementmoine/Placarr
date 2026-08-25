/**
 * Download CardGameClub CACG IT packshots into
 * `data/naruto/carddass/staging/cardgameclub/`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  cardgameclubImageUrl,
  cardgameclubIngestPackshots,
} from "../sources/cardgameclubPackshots";
import { NARUTO_PACK_ID } from "../packs";

export const NARUTO_STAGING_CARDGAMECLUB = path.join("staging", "cardgameclub");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallCardgameclubPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installCardgameclubPackshots(
  options: InstallCardgameclubPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_CARDGAMECLUB);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of cardgameclubIngestPackshots()) {
    const dest = path.join(packRoot, row.staging);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.slug);
      continue;
    }
    const buf = await downloadPng(cardgameclubImageUrl(row.image));
    if (!buf) {
      skipped.push(row.slug);
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    written.push(row.slug);
  }
  return { written, skipped };
}

async function downloadPng(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://cardgameclub.it/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf[0] !== 0x89 || buf.subarray(1, 4).toString("ascii") !== "PNG") {
      return null;
    }
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
