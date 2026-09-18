/**
 * Photo Coleka de l’album Ultra Challenge → produit scellé, pas des cartes.
 *
 * Recto seulement, URL imprimée www.paninigroup.com. Les 101 thumbs Coleka
 * n'ont pas de printKey attesté dans ce pack.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";

export type ColekaAlbumLedger = {
  sourceId: string;
  lang: string;
  released: string;
  url: string;
  printedUrl: string;
  sku: {
    slug: string;
    kind: SealedKind;
    category: string;
    name: string;
    file: string;
    url: string;
    declaredCardCount: number | null;
  };
};

const LEDGER_FILE = "coleka-album.json";
const STAGING_FOLDER = "coleka";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export function colekaAlbumPath(): string {
  return path.join(narutoUltraCuratedDir(), "sources", LEDGER_FILE);
}

export function readColekaAlbumLedger(): ColekaAlbumLedger {
  return JSON.parse(
    readFileSync(colekaAlbumPath(), "utf8"),
  ) as ColekaAlbumLedger;
}

export function colekaAlbumStagingDir(): string {
  return path.join(packStagingDir(NARUTO_ULTRA_PACK_ID), STAGING_FOLDER);
}

export async function harvestColekaAlbum(
  opts: { force?: boolean } = {},
): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = readColekaAlbumLedger();
  const destRoot = colekaAlbumStagingDir();
  mkdirSync(destRoot, { recursive: true });
  const dest = path.join(destRoot, ledger.sku.file);
  if (!opts.force && existsSync(dest)) {
    return { ok: 0, skip: 1, fail: 0 };
  }
  try {
    const res = await httpGet<ArrayBuffer>(ledger.sku.url, {
      headers: { "User-Agent": UA, Referer: ledger.url },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 100) {
      return { ok: 0, skip: 0, fail: 1 };
    }
    writeFileSync(dest, Buffer.from(data));
    return { ok: 1, skip: 0, fail: 0 };
  } catch {
    return { ok: 0, skip: 0, fail: 1 };
  }
}

export function ingestColekaAlbum(opts: { stagingDir?: string } = {}): {
  written: number;
  skipped: number;
  file: string;
} {
  const ledger = readColekaAlbumLedger();
  const staging = opts.stagingDir ?? colekaAlbumStagingDir();
  return writeLocalSealedProducts({
    packId: NARUTO_ULTRA_PACK_ID,
    source: ledger.sourceId,
    products: [
      {
        slug: ledger.sku.slug,
        kind: ledger.sku.kind,
        category: ledger.sku.category,
        name: ledger.sku.name,
        setCode: null,
        lang: ledger.lang,
        releaseDate: ledger.released,
        declaredCardCount: ledger.sku.declaredCardCount,
        path: ledger.url,
        artPath: path.join(staging, ledger.sku.file),
      },
    ],
  });
}
