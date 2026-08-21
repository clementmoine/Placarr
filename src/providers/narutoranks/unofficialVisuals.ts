/**
 * Photos fan du rip Dollar Tree (2010) → dumps `art.blogger` / `back.blogger`.
 *
 * Ce n'est pas l'hôte Inkworks : le sachet vert s'ajoute à côté du wrap
 * officiel jaune, SD-4 n'a pas d'échantillon éditeur. Le collage 3×3 et le
 * tin TDmonthly restent dehors.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import {
  packCardsDir,
  packSealedProductsDir,
  packStagingDir,
} from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

export type BloggerPackRipAsset = {
  file: string;
  url: string;
  role: "product-art" | "card-art" | "card-back";
  slug?: string;
  printed?: string;
  setCode?: string;
  number?: string;
  why?: string;
};

export type BloggerPackRipLedger = {
  sourceId: string;
  lang: string;
  referer: string;
  url: string;
  assets: BloggerPackRipAsset[];
  notIngested: { file?: string; url?: string; reason: string }[];
};

const LEDGER_FILE = "blogger-pack-rip.json";
const STAGING_FOLDER = "blogger-pack-rip";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function bloggerPackRipPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readBloggerPackRipLedger(): BloggerPackRipLedger {
  return JSON.parse(
    readFileSync(bloggerPackRipPath(), "utf8"),
  ) as BloggerPackRipLedger;
}

export function bloggerPackRipStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

export function bloggerPackRipSkippedReasons(
  ledger: BloggerPackRipLedger = readBloggerPackRipLedger(),
): string[] {
  return ledger.notIngested.map((row) => row.reason);
}

async function downloadImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 100) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

export async function harvestBloggerPackRip(
  opts: { force?: boolean } = {},
): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = readBloggerPackRipLedger();
  const destRoot = bloggerPackRipStagingDir();
  mkdirSync(destRoot, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const asset of ledger.assets) {
    const dest = path.join(destRoot, asset.file);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(asset.url, ledger.referer);
    if (!buf) {
      fail += 1;
      continue;
    }
    writeFileSync(dest, buf);
    ok += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }
  return { ok, skip, fail };
}

function dumpName(role: "art" | "back", source: string, src: string): string {
  const ext = path.extname(src).toLowerCase() || ".jpg";
  return `${role}.${source}${ext === ".jpeg" ? ".jpg" : ext}`;
}

export function installBloggerPackRip(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): { cards: number; products: number; backs: number; skipped: string[] } {
  const ledger = readBloggerPackRipLedger();
  const staging = opts.stagingDir ?? bloggerPackRipStagingDir();
  const skipped: string[] = [];
  const cardAssets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];
  let products = 0;
  let backs = 0;
  const lang = ledger.lang.trim().toLowerCase();

  for (const asset of ledger.assets) {
    const src = path.join(staging, asset.file);
    if (!existsSync(src)) {
      skipped.push(asset.file);
      continue;
    }
    if (asset.role === "product-art") {
      const slug = asset.slug?.trim();
      if (!slug) {
        skipped.push(asset.file);
        continue;
      }
      const destDir = path.join(
        packSealedProductsDir(NARUTO_RANKS_PACK_ID),
        slug,
        lang,
      );
      mkdirSync(destDir, { recursive: true });
      copyFileSync(
        src,
        path.join(destDir, dumpName("art", ledger.sourceId, src)),
      );
      products += 1;
      continue;
    }

    const setCode = asset.setCode?.trim().toLowerCase();
    const number = asset.number?.trim().toLowerCase();
    const printKey =
      setCode && number ? ninjaRanksPrintKey(setCode, number) : null;
    if (!setCode || !number || !printKey) {
      skipped.push(asset.printed ?? asset.file);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      setCode,
      number,
      lang,
    );
    mkdirSync(destDir, { recursive: true });
    if (asset.role === "card-back") {
      copyFileSync(
        src,
        path.join(destDir, dumpName("back", ledger.sourceId, src)),
      );
      backs += 1;
      continue;
    }
    const art = dumpName("art", ledger.sourceId, src);
    copyFileSync(src, path.join(destDir, art));
    cardAssets.push({
      printKey,
      lang,
      art,
      sourceUrl: asset.url,
    });
  }

  if (cardAssets.length) index.writeAssets(cardAssets);
  return {
    cards: cardAssets.length,
    products,
    backs,
    skipped,
  };
}
