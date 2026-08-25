/**
 * Download SciFi-Universe edition packshots into
 * `data/naruto/carddass/staging/scifi-universe/images/`.
 *
 * Host filenames end in `.jpg` even when the bytes are GIF.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import { scifiUniverseIngestPackshots } from "../sources/scifiUniverse";

export const NARUTO_STAGING_SCIFI = path.join(
  "staging",
  "scifi-universe",
  "images",
);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallScifiUniversePackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installScifiUniversePackshots(
  options: InstallScifiUniversePackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  mkdirSync(path.join(packRoot, NARUTO_STAGING_SCIFI), { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of scifiUniverseIngestPackshots()) {
    const dest = path.join(packRoot, row.staging);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.slug);
      continue;
    }
    const buf = await downloadImage(row.url);
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

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.scifi-universe.com/jeux/10095/naruto-jcc/gamme",
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const gif = buf.subarray(0, 3).toString("ascii") === "GIF";
    if (!jpeg && !gif) return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
