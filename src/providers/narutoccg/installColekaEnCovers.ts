/**
 * Download Coleka EN CCG display packshots into
 * `data/naruto/carddass/staging/coleka-en-covers/{s13}.webp`.
 *
 * CDN thumbs are not behind the HTML verify wall. Kayou and Rampage stay
 * skipped. The Carddass FR branch cover is the full webp, never `_300x300`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import {
  colekaCarddassFrBranchCoverUrl,
  colekaEnCcgNewDisplays,
  colekaThumbToFull,
} from "./colekaEnCcgCovers";
import { NARUTO_PACK_ID } from "./packs";

export const NARUTO_STAGING_COLEKA_EN_COVERS = path.join(
  "staging",
  "coleka-en-covers",
);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type InstallColekaEnCoversOptions = {
  packRoot?: string;
  force?: boolean;
};

export async function installColekaEnCcgCovers(
  options: InstallColekaEnCoversOptions = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const packRoot = options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const destDir = path.join(packRoot, NARUTO_STAGING_COLEKA_EN_COVERS);
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of colekaEnCcgNewDisplays()) {
    const dest = path.join(destDir, `${row.set}.webp`);
    if (!options.force && existsSync(dest)) {
      skipped.push(row.set);
      continue;
    }
    const url = colekaThumbToFull(row.thumb);
    const buf = await downloadWebp(url);
    if (!buf) {
      skipped.push(row.set);
      continue;
    }
    writeFileSync(dest, buf);
    written.push(row.set);
  }
  const frDir = path.join(
    options.packRoot ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    "coleka-carddass-fr",
  );
  mkdirSync(frDir, { recursive: true });
  const frDest = path.join(frDir, "branch-cover.webp");
  if (options.force || !existsSync(frDest)) {
    const frBuf = await downloadWebp(colekaCarddassFrBranchCoverUrl());
    if (frBuf) {
      writeFileSync(frDest, frBuf);
      written.push("carddass-fr");
    } else {
      skipped.push("carddass-fr");
    }
  } else {
    skipped.push("carddass-fr");
  }
  return { written, skipped };
}

async function downloadWebp(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: "https://www.coleka.com/" },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (buf.subarray(0, 4).toString() !== "RIFF") return null;
    return buf.byteLength >= 4_000 ? buf : null;
  } catch {
    return null;
  }
}
