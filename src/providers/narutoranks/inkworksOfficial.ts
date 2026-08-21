/**
 * Visuels officiels Inkworks (Wayback) → produits scellés, pas des faces.
 *
 * La page 2006 montre un sachet, un display, un album, un logo, deux
 * échantillons de cartes, et du marketing (key art, stack, prism). Seuls
 * les trois SKU et les deux échantillons identifiés par le nom de fichier
 * / le texte éditeur entrent au catalogue.
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
import { packCardsDir, packStagingDir } from "@/lib/packPaths";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { ninjaRanksPrintKey } from "./printKey";
import { NARUTO_RANKS_PACK_ID, narutoRanksCuratedDir } from "./pack";

export type InkworksCapture = {
  timestamp: string;
  original: string;
};

export type InkworksSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  art: string;
  declaredCardCount: number | null;
};

export type InkworksSampleCard = {
  file: string;
  printed: string;
  setCode: string;
  number: string;
};

export type InkworksSellSheet = {
  upc: {
    pack: string;
    display: string;
    case: string;
    album: string;
    albumCase: string;
  };
};

export type InkworksProductsLedger = {
  sourceId: string;
  lang: string;
  released: string;
  setCode: string;
  productPage: string;
  skus: InkworksSku[];
  logo: { file: string };
  sampleCards: InkworksSampleCard[];
  notIngested: { file: string; reason: string }[];
  sellSheet: InkworksSellSheet;
  captures: Record<string, InkworksCapture>;
};

const LEDGER_FILE = "inkworks-products.json";
const STAGING_FOLDER = "inkworks";
const ART_FILE = "art.inkworks.jpg";
const UA = "PlacarrNarutoScrape/1.0 (local collection)";

export function inkworksProductsPath(): string {
  return path.join(narutoRanksCuratedDir(), "sources", LEDGER_FILE);
}

export function readInkworksProductsLedger(): InkworksProductsLedger {
  return JSON.parse(
    readFileSync(inkworksProductsPath(), "utf8"),
  ) as InkworksProductsLedger;
}

export function inkworksStagingDir(): string {
  return path.join(packStagingDir(NARUTO_RANKS_PACK_ID), STAGING_FOLDER);
}

export function inkworksWaybackRawUrl(capture: InkworksCapture): string {
  const ts = capture.timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}id_/${capture.original}`;
}

/**
 * Tout le dump officiel : packshots, échantillons **et** le marketing.
 * Staging = cache de scrape. L'ingest choisit ensuite ce qui devient un
 * produit ou une face.
 */
export function inkworksHarvestList(
  ledger: InkworksProductsLedger = readInkworksProductsLedger(),
): { file: string; capture: InkworksCapture }[] {
  return Object.entries(ledger.captures)
    .map(([file, capture]) => ({ file, capture }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function inkworksSkippedFiles(
  ledger: InkworksProductsLedger = readInkworksProductsLedger(),
): string[] {
  return ledger.notIngested.map((row) => row.file);
}

export async function harvestInkworksOfficialAssets(
  opts: { force?: boolean } = {},
): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = readInkworksProductsLedger();
  const destRoot = inkworksStagingDir();
  mkdirSync(destRoot, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const { file, capture } of inkworksHarvestList(ledger)) {
    const dest = path.join(destRoot, file);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const url = inkworksWaybackRawUrl(capture);
    try {
      const res = await httpGet<ArrayBuffer>(url, {
        headers: { "User-Agent": UA },
        responseType: "arraybuffer",
        timeout: 40_000,
        validateStatus: (status: number) => status === 200,
      });
      const data = res.data;
      if (!data || data.byteLength < 100) {
        fail += 1;
        continue;
      }
      writeFileSync(dest, Buffer.from(data));
      ok += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 400);
      });
    } catch {
      fail += 1;
    }
  }
  return { ok, skip, fail };
}

export function ingestInkworksProducts(opts: { stagingDir?: string } = {}): {
  written: number;
  skipped: number;
  file: string;
} {
  const ledger = readInkworksProductsLedger();
  const staging = opts.stagingDir ?? inkworksStagingDir();
  const logoPath = path.join(staging, ledger.logo.file);
  const products = ledger.skus.map((sku) => ({
    slug: sku.slug,
    kind: sku.kind,
    category: sku.category,
    name: sku.name,
    setCode: ledger.setCode,
    catalogueSetId: ledger.setCode,
    lang: ledger.lang,
    releaseDate: ledger.released,
    declaredCardCount: sku.declaredCardCount,
    path: ledger.productPage,
    artPath: path.join(staging, sku.art),
    logoPath: existsSync(logoPath) ? logoPath : null,
  }));
  return writeLocalSealedProducts({
    packId: NARUTO_RANKS_PACK_ID,
    source: ledger.sourceId,
    products,
  });
}

export function installInkworksSampleFaces(
  index: LocalPrintsIndex,
  opts: { stagingDir?: string } = {},
): { installed: number; skipped: string[] } {
  const ledger = readInkworksProductsLedger();
  const staging = opts.stagingDir ?? inkworksStagingDir();
  const skipped: string[] = [];
  const assets: {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string | null;
  }[] = [];

  for (const sample of ledger.sampleCards) {
    const src = path.join(staging, sample.file);
    const printKey = ninjaRanksPrintKey(sample.setCode, sample.number);
    if (!printKey || !existsSync(src)) {
      skipped.push(sample.printed);
      continue;
    }
    const destDir = path.join(
      packCardsDir(NARUTO_RANKS_PACK_ID),
      sample.setCode.trim().toLowerCase(),
      sample.number.trim().toLowerCase(),
      "en",
    );
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, path.join(destDir, ART_FILE));
    const capture = ledger.captures[sample.file];
    assets.push({
      printKey,
      lang: "en",
      art: ART_FILE,
      sourceUrl: capture ? inkworksWaybackRawUrl(capture) : null,
    });
  }

  if (assets.length) index.writeAssets(assets);
  return { installed: assets.length, skipped };
}
