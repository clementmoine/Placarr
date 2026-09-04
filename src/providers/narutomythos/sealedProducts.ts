/**
 * Mythos sealed SKUs from LorenZone (Shopify) → products-index.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";

const LEDGER_FILE = "lorenzone-products.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type LorenzoneProductEntry = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  /** Boutique SKU when LorenZone publishes one (ex. LZ-DISPLAY-NM3-FR). */
  shopSku?: string | null;
  catalogueSetId?: string | null;
  lang: string;
  releaseDate?: string | null;
  priceCents?: number | null;
  cardsPerPack?: number | null;
  packsContained?: number | null;
  declaredCardCount?: number | null;
  path: string;
  imageUrl: string;
};

export type LorenzoneProductsLedger = {
  source: string;
  url: string;
  observed: string;
  products: LorenzoneProductEntry[];
};

export function lorenzoneProductsPath(): string {
  return path.join(narutoMythosCuratedDir(), "sources", LEDGER_FILE);
}

export function readLorenzoneProductsLedger(): LorenzoneProductsLedger {
  return JSON.parse(
    readFileSync(lorenzoneProductsPath(), "utf8"),
  ) as LorenzoneProductsLedger;
}

function artPath(slug: string, lang: string): string {
  return path.join(
    narutoMythosCuratedDir(),
    "products",
    slug,
    lang?.trim().toLowerCase(),
    "art.lorenzone.png",
  );
}

async function downloadImage(url: string, referer: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
      responseType: "arraybuffer",
      timeout: 60_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data);
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

export async function harvestLorenzoneProductImages(opts: {
  force?: boolean;
  ledger?: LorenzoneProductsLedger;
} = {}): Promise<{ ok: number; skip: number; fail: number }> {
  const ledger = opts.ledger ?? readLorenzoneProductsLedger();
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const product of ledger.products) {
    const dest = artPath(product.slug, product.lang);
    if (!opts.force && existsSync(dest)) {
      skip += 1;
      continue;
    }
    const buf = await downloadImage(product.imageUrl, ledger.url);
    if (!buf) {
      fail += 1;
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    ok += 1;
  }
  return { ok, skip, fail };
}

export async function ingestMythosSealedProducts(opts: {
  force?: boolean;
  ledger?: LorenzoneProductsLedger;
} = {}): Promise<{ written: number; skipped: number; file: string }> {
  const ledger = opts.ledger ?? readLorenzoneProductsLedger();
  await harvestLorenzoneProductImages({ force: opts.force, ledger });

  const products = ledger.products.flatMap((row) => {
    const dest = artPath(row.slug, row.lang);
    if (!existsSync(dest)) return [];
    const catalogueSetId = row.catalogueSetId?.trim().toLowerCase() || null;
    // Never invent a set: Set 2/3 SKUs must declare catalogueSetId explicitly.
    if (!catalogueSetId) return [];
    return [
      {
        slug: row.slug,
        kind: row.kind,
        category: row.category,
        name: row.name,
        setCode: row.shopSku ?? row.slug,
        catalogueSetId,
        lang: row.lang,
        releaseDate: row.releaseDate ?? null,
        priceCents: row.priceCents ?? null,
        cardsPerPack: row.cardsPerPack ?? null,
        packsContained: row.packsContained ?? null,
        declaredCardCount: row.declaredCardCount ?? null,
        path: row.path,
        artPath: dest,
      },
    ];
  });

  if (!products.length) {
    return { written: 0, skipped: ledger.products.length, file: "" };
  }

  const result = writeLocalSealedProducts({
    packId: NARUTO_MYTHOS_PACK_ID,
    source: "lorenzone",
    products,
  });
  return {
    written: result.written,
    skipped: result.skipped + (ledger.products.length - products.length),
    file: result.file,
  };
}
