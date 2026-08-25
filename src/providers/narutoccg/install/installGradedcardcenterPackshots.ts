/**
 * Download the pasted GCC JP packshots into
 * `data/naruto/carddass/staging/gradedcardcenter/`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  gradedcardcenterIngestPackshots,
  gradedcardcenterOriginalUrl,
} from "../sources/gradedcardcenterPackshots";
import { NARUTO_PACK_ID } from "../packs";

export const NARUTO_STAGING_GRADEDCARDCENTER = path.join(
  "staging",
  "gradedcardcenter",
);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallGradedcardcenterPackshotsOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installGradedcardcenterPackshots(
  options: InstallGradedcardcenterPackshotsOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  mkdirSync(path.join(packRoot, NARUTO_STAGING_GRADEDCARDCENTER), {
    recursive: true,
  });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of gradedcardcenterIngestPackshots()) {
    const faces = [
      { key: row.slug, url: row.recto.url, staging: row.recto.staging },
      {
        key: `${row.slug}-back`,
        url: row.verso.url,
        staging: row.verso.staging,
      },
    ];
    for (const face of faces) {
      const dest = path.join(packRoot, face.staging);
      if (!options.force && existsSync(dest)) {
        skipped.push(face.key);
        continue;
      }
      const buf = await downloadJpeg(gradedcardcenterOriginalUrl(face.url));
      if (!buf) {
        skipped.push(face.key);
        continue;
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      written.push(face.key);
    }
  }
  return { written, skipped };
}

async function downloadJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://gradedcardcenter.com/" },
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
