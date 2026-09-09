/**
 * Download Vinted CDN packshots into `data/naruto/carddass/staging/vinted/`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  vintedIngestBacks,
  vintedIngestPackshots,
  vintedLedger,
} from "../sources/vintedPackshots";

export const NARUTO_STAGING_VINTED = path.join("staging", "vinted");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallVintedPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installVintedPackshots(
  options: InstallVintedPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_VINTED);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  const ledger = vintedLedger();
  const rows = [
    ...vintedIngestPackshots(),
    ...vintedIngestBacks(),
    ...ledger.extraAngles.filter((row) => row.staging),
  ];
  const seen = new Set<string>();
  for (const row of rows) {
    const dest = path.join(packRoot, row.staging);
    if (seen.has(dest)) continue;
    seen.add(dest);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.staging);
      continue;
    }
    const buf = await downloadWebp(row.url, ledger.listing);
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

async function downloadWebp(
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
    if (buf.subarray(0, 4).toString() !== "RIFF") return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
