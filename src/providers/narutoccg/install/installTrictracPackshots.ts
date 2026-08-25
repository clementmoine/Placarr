/**
 * Download Tric Trac starter-box originals into
 * `data/naruto/carddass/staging/trictrac/`.
 *
 * Card thumbs stay in the ledger as faces.ingest = none.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../indexStore";
import {
  trictracCdnOriginal,
  trictracIngestPackshots,
} from "../trictracPackshots";

export const NARUTO_STAGING_TRICTRAC = path.join("staging", "trictrac");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallTrictracOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installTrictracPackshots(
  options: InstallTrictracOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_TRICTRAC);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of trictracIngestPackshots()) {
    const dest = path.join(destDir, path.basename(row.staging));
    if (!options.force && existsSync(dest)) {
      skipped.push(row.slug);
      continue;
    }
    const buf = await downloadJpeg(trictracCdnOriginal(row.url));
    if (!buf) {
      skipped.push(row.slug);
      continue;
    }
    writeFileSync(dest, buf);
    written.push(row.slug);
  }
  return { written, skipped };
}

async function downloadJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://trictrac.net/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
