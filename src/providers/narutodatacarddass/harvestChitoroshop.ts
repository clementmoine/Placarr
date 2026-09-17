/**
 * Harvest Chitoroshop Shopify `products.json` (paginated) into the DCD face
 * ledger `curated/sources/chitoroshop.json`.
 *
 * Live crawl is opt-in (`crawl: true` on the ledger, or `--crawl` argv). The
 * ledger stays the install source of truth — bytes are still downloaded by
 * `installChitoroshopFaces`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  formatDataCarddassReference,
  parseDataCarddassPrinted,
} from "./printKey";
import { narutoDataCarddassCuratedDir } from "./pack";

const COLLECTION =
  "https://chitoroshop.com/collections/naruto-tcg-cartes-a-lunite-japonaises-naruto/products.json?limit=250";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Printed ref in Shopify title / handle. */
const PRINTED_RE =
  /\b((?:NFP|NFM|NFC|NXPF|NXP|DNP|DMP|DN|DT|NM|NC|NF|NX)[-]?0*\d+(?:[-]?[A-Za-z])?)\b/i;

export type ShopifyProduct = {
  handle: string;
  title: string;
  images?: { src: string; position?: number }[];
};

export type ChitoroshopFaceRow = {
  printed: string;
  handle: string;
  productUrl: string;
  url: string;
  title: string;
  ingest: boolean;
};

export type ChitoroshopLedger = {
  source: string;
  observed: string;
  ingest: string;
  crawl: boolean;
  note: string;
  listed: number;
  faces: ChitoroshopFaceRow[];
};

function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i >= 0 ? url.slice(0, i) : url;
}

/** Prefer shop-relative CDN host when Shopify returns the global CDN. */
export function normalizeChitoroshopImageUrl(src: string): string | null {
  const bare = stripQuery(src.trim());
  if (!bare) return null;
  try {
    const u = new URL(bare);
    if (
      u.hostname === "chitoroshop.com" ||
      u.hostname.endsWith(".chitoroshop.com")
    ) {
      // Drop accidental shop-id segments: /cdn/shop/files/1/…/files/X → /cdn/shop/files/X
      const nested = u.pathname.match(/\/cdn\/shop\/files\/(?:\d+\/)+\d+\/files\/(.+)$/i);
      if (nested) {
        return `https://chitoroshop.com/cdn/shop/files/${nested[1]!}`;
      }
      return bare;
    }
    // cdn.shopify.com/s/files/1/…/files/X.jpg → chitoroshop.com/cdn/shop/files/X.jpg
    const m = u.pathname.match(/\/(?:s\/)?files\/(?:\d+\/)+\d+\/files\/(.+)$/i);
    if (m) {
      return `https://chitoroshop.com/cdn/shop/files/${m[1]!}`;
    }
    const fileOnly = u.pathname.match(/\/files\/([^/]+)$/i);
    if (fileOnly) {
      return `https://chitoroshop.com/cdn/shop/files/${fileOnly[1]!}`;
    }
  } catch {
    return null;
  }
  return bare.startsWith("https://") ? bare : null;
}

export function extractPrintedFromChitoroshopProduct(
  product: Pick<ShopifyProduct, "handle" | "title">,
): string | null {
  const handle = product.handle ?? "";
  const title = product.title ?? "";
  // Slug quirk documented in the ledger: NX-0271 → NX-271.
  if (/nx-0271/i.test(handle) || /nx-0271/i.test(title)) return "NX-271";
  const m = title.match(PRINTED_RE) || handle.match(PRINTED_RE);
  if (!m) return null;
  const parsed = parseDataCarddassPrinted(m[1]!);
  if (!parsed) return null;
  return formatDataCarddassReference(parsed.set, parsed.number);
}

export function facesFromChitoroshopProducts(
  products: readonly ShopifyProduct[],
): ChitoroshopFaceRow[] {
  const faces: ChitoroshopFaceRow[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const printed = extractPrintedFromChitoroshopProduct(product);
    if (!printed) continue;
    const key = printed.toUpperCase();
    if (seen.has(key)) continue;
    const img = product.images?.[0]?.src;
    if (!img) continue;
    const url = normalizeChitoroshopImageUrl(img);
    if (!url) continue;
    seen.add(key);
    faces.push({
      printed: key,
      handle: product.handle,
      productUrl: `https://chitoroshop.com/products/${product.handle}`,
      url,
      title: product.title,
      ingest: true,
    });
  }
  faces.sort((a, b) =>
    a.printed.localeCompare(b.printed, undefined, { numeric: true }),
  );
  return faces;
}

export async function fetchChitoroshopCollectionProducts(): Promise<
  ShopifyProduct[]
> {
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await httpGet<{ products?: ShopifyProduct[] }>(
      `${COLLECTION}&page=${page}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        timeout: 40_000,
        validateStatus: (status) => status === 200,
      },
    );
    const batch = res.data?.products ?? [];
    products.push(...batch);
    if (batch.length < 250) break;
  }
  return products;
}

export function buildChitoroshopLedger(
  products: readonly ShopifyProduct[],
  observed = new Date().toISOString().slice(0, 10),
): ChitoroshopLedger {
  const faces = facesFromChitoroshopProducts(products);
  return {
    source:
      "chitoroshop.com — Naruto Data Carddass singles (Shopify products.json)",
    observed,
    ingest: "faces",
    crawl: false,
    note: "Boutique FR Shopify. Collection paginée limit=250. Titres EN « Name DN-038T | … ». Images /cdn/shop/files/*.jpg. NX-0271 slug → NX-271.",
    listed: faces.length,
    faces,
  };
}

export function writeChitoroshopLedger(
  ledger: ChitoroshopLedger,
  outPath = path.join(
    narutoDataCarddassCuratedDir(),
    "sources",
    "chitoroshop.json",
  ),
): string {
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return outPath;
}

/** Live harvest → rewrite curated ledger. */
export async function harvestChitoroshopDataCarddassFaces(): Promise<{
  products: number;
  faces: number;
  path: string;
}> {
  const products = await fetchChitoroshopCollectionProducts();
  const ledger = buildChitoroshopLedger(products);
  const out = writeChitoroshopLedger(ledger);
  return { products: products.length, faces: ledger.faces.length, path: out };
}
