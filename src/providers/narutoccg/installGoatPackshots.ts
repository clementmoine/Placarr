/**
 * Download Goat Coleka-gap display boxes into
 * `data/naruto/carddass/staging/goat-en-boxes/`.
 *
 * JPEG, PNG, or GIF (s16 CDN is named .jpg but the bytes are GIF89a).
 * Faces stay out. s1–s6 / JP 4/6 / blisters are not in the ingest list.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { goatCdnOriginal, goatIngestPackshots } from "./goatPackshots";
import { NARUTO_PACK_ID } from "./packs";

export const NARUTO_STAGING_GOAT_EN_BOXES = path.join(
  "staging",
  "goat-en-boxes",
);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallGoatPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installGoatPackshots(
  options: InstallGoatPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  mkdirSync(path.join(packRoot, NARUTO_STAGING_GOAT_EN_BOXES), {
    recursive: true,
  });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of goatIngestPackshots()) {
    const dest = path.join(packRoot, row.staging);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.slug);
      continue;
    }
    const buf = await downloadBox(goatCdnOriginal(row.url));
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

function isJpeg(buf: Buffer): boolean {
  return buf[0] === 0xff && buf[1] === 0xd8;
}

function isPng(buf: Buffer): boolean {
  return (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  );
}

function isGif(buf: Buffer): boolean {
  return (
    buf.subarray(0, 6).toString("ascii") === "GIF89a" ||
    buf.subarray(0, 6).toString("ascii") === "GIF87a"
  );
}

async function downloadBox(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer:
          "https://goatcardsshop.crystalcommerce.com/catalog/naruto_sealed_product-naruto_ccg_sealed_booster_boxes/3970",
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (!isJpeg(buf) && !isPng(buf) && !isGif(buf)) return null;
    return buf.byteLength >= 8_000 ? buf : null;
  } catch {
    return null;
  }
}
