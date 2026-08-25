/**
 * Download eBay listing packshots into `data/naruto/carddass/staging/ebay/`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { ebayIngestPackshots, ebayListingImageFull } from "../sources/ebayPackshots";
import { NARUTO_PACK_ID } from "../indexStore";

export const NARUTO_STAGING_EBAY = path.join("staging", "ebay");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallEbayPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installEbayPackshots(
  options: InstallEbayPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_EBAY);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of ebayIngestPackshots()) {
    const dest = path.join(destDir, path.basename(row.staging));
    if (!options.force && existsSync(dest)) {
      skipped.push(row.slug);
      continue;
    }
    const buf = await downloadWebp(ebayListingImageFull(row.url));
    if (!buf) {
      skipped.push(row.slug);
      continue;
    }
    writeFileSync(dest, buf);
    written.push(row.slug);
  }
  return { written, skipped };
}

async function downloadWebp(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://www.ebay.fr/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf.subarray(0, 4).toString() !== "RIFF") return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
