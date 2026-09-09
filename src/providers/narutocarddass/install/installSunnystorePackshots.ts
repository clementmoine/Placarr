/**
 * Download Sunny Store Shopify packshots into `staging/sunnystore/`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  sunnystoreIngestBacks,
  sunnystoreIngestPackshots,
  sunnystorePackshotLedger,
} from "../sources/sunnystorePackshots";

export const NARUTO_STAGING_SUNNYSTORE = path.join("staging", "sunnystore");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallSunnystorePackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installSunnystorePackshots(
  options: InstallSunnystorePackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  mkdirSync(path.join(packRoot, NARUTO_STAGING_SUNNYSTORE), {
    recursive: true,
  });
  const written: string[] = [];
  const skipped: string[] = [];
  const ledger = sunnystorePackshotLedger();
  const rows = [...sunnystoreIngestPackshots(), ...sunnystoreIngestBacks()];
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
      row.url,
      row.listing || ledger.listings[0] || row.url,
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
