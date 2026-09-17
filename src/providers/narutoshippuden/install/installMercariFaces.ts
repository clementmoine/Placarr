/**
 * Install Mercari faces into 疾風伝 as `art.mercari.*`.
 * Ledger rows list a live mercdn `url` (optional `curated` offline fallback).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import { downloadMercariOrigPhoto } from "@/providers/shared/mercariCdn";

import { narutoShippudenCuratedDir } from "../assets";
import {
  NARUTO_SHIPPUDEN_PACK_ID,
  openNarutoShippudenDbForWrite,
} from "../indexStore";
import { diskIdFromPrintedReference } from "../searchPrints";
import { shippudenMercariIngestFaces } from "../sources/mercari";

const LANG = "ja";

function extFromMagic(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (buf.length >= 8 && buf.subarray(1, 4).toString("ascii") === "PNG") {
    return ".png";
  }
  if (buf.length >= 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return ".bin";
}

function existingMercariArt(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  return (
    readdirSync(cardDir).find((name) => /^art\.mercari\./i.test(name)) ?? null
  );
}

function writeMercariArt(cardDir: string, buf: Buffer): string {
  const ext = extFromMagic(buf);
  const destName = `art.mercari${ext === ".bin" ? ".bin" : ext}`;
  mkdirSync(cardDir, { recursive: true });
  for (const name of readdirSync(cardDir)) {
    if (/^art\.mercari\./i.test(name) && name !== destName) {
      unlinkSync(path.join(cardDir, name));
    }
  }
  writeFileSync(path.join(cardDir, destName), buf);
  return destName;
}

export type InstallShippudenMercariFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  dryRun?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

/**
 * Disk layout: `cards/{family}/{lang}/{diskId}/art.mercari.*`
 * (`shi/ja/shi0001/…`).
 */
export async function installShippudenMercariFaces(
  options: InstallShippudenMercariFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_SHIPPUDEN_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoShippudenCuratedDir();
  const fetchImage = options.fetchImage ?? downloadMercariOrigPhoto;
  const staging = path.join(packStagingDir(NARUTO_SHIPPUDEN_PACK_ID), "mercari");
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const row of shippudenMercariIngestFaces()) {
    const diskId = diskIdFromPrintedReference(row.printedRef);
    if (!diskId) {
      failed.push(row.printedRef);
      continue;
    }
    const family = diskId.replace(/\d+$/, "");
    const cardDir = packCardDir(NARUTO_SHIPPUDEN_PACK_ID, {
      set: family,
      lang: LANG,
      card: diskId,
    });
    const key = `${diskId}/${LANG}`;

    const printKey = `naruto:${family}-${diskId.slice(family.length)}`;
    let destName = existingMercariArt(cardDir);

    if (!destName || options.force) {
      let buf: Buffer | null = null;
      const curatedRel =
        "curated" in row && typeof row.curated === "string" ? row.curated : null;
      if (curatedRel) {
        const src = path.join(curatedRoot, curatedRel);
        if (existsSync(src)) buf = readFileSync(src);
      }
      if (!buf && typeof row.url === "string" && row.url.length > 0) {
        buf = await fetchImage(row.url);
      }
      if (!buf || extFromMagic(buf) === ".bin" || buf.byteLength < 8_000) {
        failed.push(key);
        continue;
      }
      if (options.dryRun) {
        written.push(key);
        continue;
      }
      writeFileSync(path.join(staging, `${diskId}${extFromMagic(buf)}`), buf);
      destName = writeMercariArt(cardDir, buf);
      written.push(key);
    } else {
      skipped.push(key);
    }

    try {
      const db = openNarutoShippudenDbForWrite();
      db.prepare(
        `INSERT INTO print_assets (print_key, lang, art, source_url, printed)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(print_key, lang) DO UPDATE SET
           art = excluded.art,
           source_url = COALESCE(excluded.source_url, print_assets.source_url)`,
      ).run(printKey, LANG, destName, row.listingUrl);
    } catch {
      /* ignore db errors in dry runs or headless tests */
    }
  }

  writeFileSync(
    path.join(staging, "faces.json"),
    `${JSON.stringify({ source: "mercari", packRoot, written, skipped, failed }, null, 2)}\n`,
  );

  return { written, skipped, failed };
}
