/**
 * Download Leboncoin CDN packshots into `data/naruto/carddass/staging/leboncoin/`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  leboncoinIngestBacks,
  leboncoinIngestPackshots,
  leboncoinPackshotImageFull,
} from "../sources/leboncoinPackshots";

export const NARUTO_STAGING_LEBONCOIN = path.join("staging", "leboncoin");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const REFERER = "https://www.leboncoin.fr/";

export type InstallLeboncoinPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installLeboncoinPackshots(
  options: InstallLeboncoinPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_LEBONCOIN);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  const rows = [...leboncoinIngestPackshots(), ...leboncoinIngestBacks()];
  const seen = new Set<string>();
  for (const row of rows) {
    const dest = path.join(packRoot, row.staging);
    if (seen.has(dest)) continue;
    seen.add(dest);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.staging);
      continue;
    }
    const buf = await downloadJpeg(
      leboncoinPackshotImageFull(row.url),
      row.listing || REFERER,
    );
    if (!buf) {
      skipped.push(row.staging);
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    written.push(row.staging);
  }
  return { written, skipped };
}

async function downloadJpeg(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
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
