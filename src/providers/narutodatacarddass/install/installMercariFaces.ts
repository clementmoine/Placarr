/**
 * Install Mercari faces into Data Carddass as `art.mercari.*`.
 * Ledger rows list a live mercdn `url` (optional `curated` offline fallback).
 * Studio matte crop runs on downloaded bytes by default.
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

import { cropStudioMatte } from "@/core/enrich/media";
import { packCardDir, packStagingDir } from "@/lib/packPaths";
import { dataRoot } from "@/lib/runtimeData";
import type { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { downloadMercariOrigPhoto } from "@/providers/shared/mercariCdn";

import {
  dataCarddassPrintKey,
  parseDataCarddassPrinted,
} from "../printKey";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "../pack";
import { dataCarddassMercariIngestFaces } from "../sources/mercariFaces";

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

export type InstallDataCarddassMercariFacesOptions = {
  packRoot?: string;
  curatedRoot?: string;
  force?: boolean;
  index?: ReturnType<typeof createLocalPrintsIndex>;
  /** Crop light studio matte (Mercari square pads). Default on. */
  cropMatte?: boolean;
  fetchImage?: (url: string) => Promise<Buffer | null>;
};

export async function installDataCarddassMercariFaces(
  options: InstallDataCarddassMercariFacesOptions = {},
): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const packRoot =
    options.packRoot ?? path.join(dataRoot(), NARUTO_DATA_CARDDASS_PACK_ID);
  const curatedRoot = options.curatedRoot ?? narutoDataCarddassCuratedDir();
  const fetchImage = options.fetchImage ?? downloadMercariOrigPhoto;
  const staging = path.join(
    packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "mercari",
  );
  mkdirSync(staging, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const assets: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl?: string;
  }> = [];
  const cropMatte = options.cropMatte !== false;

  for (const row of dataCarddassMercariIngestFaces()) {
    const parsed = parseDataCarddassPrinted(row.printedRef);
    if (!parsed) {
      failed.push(row.printedRef);
      continue;
    }
    const printKey = dataCarddassPrintKey(parsed.set, parsed.number);
    if (!printKey) {
      failed.push(row.printedRef);
      continue;
    }
    const cardDir = packCardDir(NARUTO_DATA_CARDDASS_PACK_ID, {
      set: parsed.set,
      lang: LANG,
      card: parsed.number,
    });
    const key = `${parsed.set}/${LANG}/${parsed.number}`;
    if (!options.force && existingMercariArt(cardDir)) {
      const art = existingMercariArt(cardDir)!;
      assets.push({
        printKey,
        lang: LANG,
        art,
        sourceUrl: row.listingUrl,
      });
      skipped.push(key);
      continue;
    }

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
    if (!buf) {
      failed.push(key);
      continue;
    }
    if (cropMatte) {
      buf = await cropStudioMatte(buf);
    }
    const stageName = `${parsed.set}-${parsed.number}${extFromMagic(buf)}`;
    writeFileSync(path.join(staging, stageName), buf);
    const art = writeMercariArt(cardDir, buf);
    assets.push({
      printKey,
      lang: LANG,
      art,
      sourceUrl: row.listingUrl,
    });
    written.push(key);
  }

  if (options.index && assets.length) {
    options.index.writeAssets(assets);
  }
  return { written, skipped, failed };
}
