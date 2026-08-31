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
import {
  writeLocalSealedProducts,
  type LocalSealedWrite,
} from "@/providers/shared/sealedProducts/localWrite";
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

/** Packshots fournis par le propriétaire, sous `curated/products/{slug}/en/`. */
export function ninjaRanksCuratedProductsDir(): string {
  return path.join(narutoRanksCuratedDir(), "products");
}

const RECONSTRUCTED_LEDGER = "reconstructed-products.json";
const RECONSTRUCTED_SOURCE_ID = "reconstructed";

export function readNinjaRanksReconstructedArt(
  root?: string,
): Map<string, string> {
  const dir = root ?? ninjaRanksCuratedProductsDir();
  const ledgerPath = path.join(
    narutoRanksCuratedDir(),
    "sources",
    RECONSTRUCTED_LEDGER,
  );
  if (!existsSync(ledgerPath)) return new Map();
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
    lang: string;
    products: { slug: string; art: string }[];
  };
  const lang = ledger.lang?.trim().toLowerCase();
  const found = new Map<string, string>();
  for (const product of ledger.products) {
    const file = path.join(dir, product.slug, lang, product.art);
    if (existsSync(file)) found.set(product.slug, file);
  }
  return found;
}

export function inkworksSealedSpecs(
  opts: {
    stagingDir?: string;
    curatedProductsDir?: string;
  } = {},
): { products: LocalSealedWrite[]; source: string } {
  const ledger = readInkworksProductsLedger();
  const staging = opts.stagingDir ?? inkworksStagingDir();
  const logoPath = path.join(staging, ledger.logo.file);
  /*
    Les packshots détourés priment sur les vignettes marketing du Wayback —
    `nnrwrapmed` fait 253×360 quand le PNG fourni fait 1597×2599. L'original
    éditeur n'est pas écrasé pour autant : il descend en dump à côté, comme
    l'album Coleka reste à côté de l'upscale chez Ultra Challenge.
  */
  const curatedArt = readNinjaRanksReconstructedArt(opts.curatedProductsDir);
  /*
    Le lot EN ne bascule en `reconstructed` que si **chaque** SKU a son
    packshot curé — sinon un visuel Inkworks se retrouverait nommé
    `art.reconstructed`, ce qui mentirait sur sa provenance. Même précédent
    que le pack Ultra Challenge.
  */
  const allCurated =
    ledger.skus.length > 0 &&
    ledger.skus.every((sku) => curatedArt.has(sku.slug));
  const products = ledger.skus.map((sku) => {
    const better = allCurated ? (curatedArt.get(sku.slug) ?? null) : null;
    const official = path.join(staging, sku.art);
    return {
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
      artPath: better ?? official,
      logoPath: existsSync(logoPath) ? logoPath : null,
      extraDumps:
        better && existsSync(official)
          ? [{ source: ledger.sourceId, artPath: official }]
          : [],
    };
  });
  return {
    products,
    source: allCurated ? RECONSTRUCTED_SOURCE_ID : ledger.sourceId,
  };
}

export function ingestInkworksProducts(
  opts: {
    stagingDir?: string;
    curatedProductsDir?: string;
  } = {},
): {
  written: number;
  skipped: number;
  file: string;
} {
  const { products, source } = inkworksSealedSpecs(opts);
  return writeLocalSealedProducts({
    packId: NARUTO_RANKS_PACK_ID,
    source,
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
      "en",
      sample.number.trim().toLowerCase(),
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
