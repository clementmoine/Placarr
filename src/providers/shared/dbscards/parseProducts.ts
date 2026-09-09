/**
 * Product listings and sealed-product fiches for the TCG Cards family
 * (dbscards, fw.dbscards, lorcards, pkmcards, opecards, …). Pure: no I/O.
 *
 * The card list on a product page uses the same tiles as `/cards` (see
 * `parseDbscardsTiles`). Measured 2026-08-16: that grid is capped at **15**
 * tiles even when `Contenu → Nombre de cartes` is higher (SD23 declares 19,
 * EX24 declares 56). This parser stores the preview + `declaredCardCount`.
 * `completePrints` unions a Bandai series from `catalog.sqlite` after, on
 * DBS only.
 *
 * Category roles live in `sites.ts`. Accessories are never requested.
 * Displays stay listing-only. Boosters are opened for the site's own
 * 15-tile preview (« un bref aperçu ») — that grid is not the pack.
 */
import { decode } from "html-entities";

import {
  tcgCardsCategoryRole,
  tcgCardsDetailCategories,
  tcgCardsListingCategories,
} from "./sites";
import { parseDbscardsTiles, type DbscardsTile } from "./tile";

/** Masters defaults — other hosts use `tcgCardsListingCategories(id)`. */
export const DBSCARDS_PRODUCT_LISTING_CATEGORIES =
  tcgCardsListingCategories("masters");

export const DBSCARDS_PRODUCT_DETAIL_CATEGORIES =
  tcgCardsDetailCategories("masters");

export type DbscardsProductCategory = string;

export type DbscardsProductListingRow = {
  category: string;
  path: string;
  slug: string;
  image: string | null;
  detailArchived: boolean;
};

export type DbscardsProductPrintLink = {
  slug: string;
  path: string;
  ref: string | null;
  sku: string | null;
  name: string;
};

export type DbscardsProductPage = {
  path: string;
  slug: string;
  category: string;
  name: string | null;
  image: string | null;
  sku: string | number | null;
  price: string | null;
  currency: string | null;
  setCode: string | null;
  lang: string | null;
  releaseDate: string | null;
  declaredCardCount: number | null;
  containsPrints: DbscardsProductPrintLink[];
  containsPrintsIsPreview: boolean;
  relatedProducts: string[];
  tables: Record<string, Record<string, string[]>>;
};

const PRODUCT_HREF = /href="(\/products\/([a-z0-9-]+)\/([^"?#]+))"/gi;
const ITEM_LIST_URL = /"url"\s*:\s*"(\/products\/[^"]+)"/g;
const DATA_SRC_PRODUCT =
  /data-src="(https:\/\/static\.[^"]+\/products\/[^"]+\.webp)"/gi;
/** `og:image` prints `/products/FR/…`; Apache 404s that, `/fr/` is the file. */
const STATIC_LOCALE_FOLDER = /(\/products\/)([A-Za-z]{2})(\/)/;

export function tcgCardsStaticProductImage(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  return url.replace(
    STATIC_LOCALE_FOLDER,
    (_m, prefix: string, loc: string, rest: string) =>
      `${prefix}${loc.toLowerCase()}${rest}`,
  );
}

const H1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
const OG_IMAGE = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i;
const LD_JSON = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
const TABLE = /<table[^>]*>([\s\S]*?)<\/table>/gi;
const CAPTION = /<caption[^>]*>([\s\S]*?)<\/caption>/i;
const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const TH = /<th[^>]*>([\s\S]*?)<\/th>/i;
const TD = /<td[^>]*>([\s\S]*?)<\/td>/i;

function textOf(html: string): string {
  const broken = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n");
  return decode(broken.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Category listing. Page 2+ is a path segment (`/products/boosters/2`),
 * measured 2026-08-16: that GET returns 30 new SKUs, zero overlap with
 * page 1. `?page=` is JS-only on this host and must not be used here.
 *
 * Default listings follow the site locale (FR on lorcards). EN-only SKUs
 * (D23 collector boxes) are absent until `language=ALL`.
 */
export const TCGCARDS_LISTING_LANGUAGE = "ALL";

export function dbscardsProductListingUrl(
  origin: string,
  category: string,
  page = 1,
): string {
  const base = `${origin.replace(/\/$/, "")}/products/${category}`;
  const path = page <= 1 ? base : `${base}/${page}`;
  return `${path}?language=${TCGCARDS_LISTING_LANGUAGE}`;
}

export function dbscardsProductPageUrl(origin: string, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${origin.replace(/\/$/, "")}${clean}`;
}

/**
 * `/products/{category}/{slug}` → a listing row, or null when the path is
 * pagination, an accessory, or not a product fiche.
 */
export function dbscardsListingRowFromPath(
  path: string,
): DbscardsProductListingRow | null {
  const clean = path.split(/[?#]/)[0]?.replace(/\/$/, "") ?? "";
  const match = /^\/products\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(clean);
  if (!match) return null;
  const category = match[1]!;
  const slug = match[2]!;
  if (/^\d+$/.test(slug)) return null;
  const role = tcgCardsCategoryRole(category);
  if (role === "skip") return null;
  return {
    category,
    path: clean,
    slug,
    image: null,
    detailArchived: role === "preview" || role === "detail",
  };
}

function listingImages(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of html.matchAll(DATA_SRC_PRODUCT)) {
    const url = tcgCardsStaticProductImage(match[1]!);
    if (!url) continue;
    const file = url
      .split("/")
      .pop()
      ?.replace(/\.webp$/i, "");
    if (!file) continue;
    out.set(file, url);
  }
  return out;
}

function listingImageForSlug(
  images: Map<string, string>,
  slug: string,
): string | null {
  const direct = images.get(slug);
  if (direct) return direct;
  const needle = `-${slug}`.toLowerCase();
  for (const [file, url] of images) {
    if (file.toLowerCase().endsWith(needle)) return url;
  }
  return null;
}

/**
 * Product paths on a category listing.
 *
 * Their card lists publish only half the tiles in JSON-LD. Product listings
 * measured 2026-08-16 matched `numberOfItems` — still union ItemList + hrefs
 * so a half-blind page cannot silently drop a deck.
 */
export function parseDbscardsProductListing(
  html: string,
  category: string,
): DbscardsProductListingRow[] {
  const images = listingImages(html);
  const paths: string[] = [];
  const seen = new Set<string>();
  const consider = (path: string) => {
    if (!path.startsWith(`/products/${category}/`)) return;
    const slug = path.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug || /^\d+$/.test(slug)) return;
    if (seen.has(path)) return;
    seen.add(path);
    paths.push(path);
  };
  for (const match of html.matchAll(ITEM_LIST_URL)) consider(match[1]!);
  for (const match of html.matchAll(PRODUCT_HREF)) consider(match[1]!);

  return paths.map((path) => {
    const slug = path.replace(/\/$/, "").split("/").pop()!;
    return {
      category,
      path,
      slug,
      image: listingImageForSlug(images, slug),
      detailArchived:
        tcgCardsCategoryRole(category) === "preview" ||
        tcgCardsCategoryRole(category) === "detail",
    };
  });
}

function parseTables(html: string): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const table of html.matchAll(TABLE)) {
    const body = table[1] ?? "";
    const caption = CAPTION.exec(body);
    if (!caption) continue;
    const fields: Record<string, string[]> = {};
    for (const row of body.matchAll(ROW)) {
      const cells = row[1] ?? "";
      const label = TH.exec(cells);
      const value = TD.exec(cells);
      if (!label || !value) continue;
      const key = textOf(label[1] ?? "");
      const values = textOf(value[1] ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (key) fields[key] = values;
    }
    if (Object.keys(fields).length > 0) {
      out[textOf(caption[1] ?? "")] = fields;
    }
  }
  return out;
}

function jsonLdProduct(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(LD_JSON)) {
    try {
      const data: unknown = JSON.parse(match[1] ?? "");
      if (
        data &&
        typeof data === "object" &&
        (data as { "@type"?: string })["@type"] === "Product"
      ) {
        return data as Record<string, unknown>;
      }
    } catch {
      // One broken block must not lose the fiche.
    }
  }
  return null;
}

function firstField(
  tables: Record<string, Record<string, string[]>>,
  caption: string,
  label: string,
): string | null {
  const value = tables[caption]?.[label]?.[0]?.trim();
  return value || null;
}

function declaredCardCount(
  tables: Record<string, Record<string, string[]>>,
): number | null {
  const raw = firstField(tables, "Contenu", "Nombre de cartes");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function printLinks(html: string): DbscardsProductPrintLink[] {
  const seen = new Set<string>();
  const out: DbscardsProductPrintLink[] = [];
  for (const tile of parseDbscardsTiles(html) as DbscardsTile[]) {
    if (!tile.slug || seen.has(tile.slug)) continue;
    seen.add(tile.slug);
    out.push({
      slug: tile.slug,
      path: `/cards/${tile.slug}`,
      ref: tile.ref,
      sku: tile.sku,
      name: tile.name,
    });
  }
  return out;
}

function relatedProducts(html: string, selfPath: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(PRODUCT_HREF)) {
    const path = match[1]!;
    if (path === selfPath || seen.has(path)) continue;
    const slug = path.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug || /^\d+$/.test(slug)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

export function parseDbscardsProductPage(
  html: string,
  path: string,
  category: string,
): DbscardsProductPage {
  const slug = path.replace(/\/$/, "").split("/").pop() ?? "";
  const tables = parseTables(html);
  const ld = jsonLdProduct(html);
  const offer =
    ld?.offers && typeof ld.offers === "object"
      ? (ld.offers as Record<string, unknown>)
      : null;
  const h1 = H1.exec(html);
  const og = OG_IMAGE.exec(html);
  const containsPrints = printLinks(html);
  const declared = declaredCardCount(tables);
  const image = tcgCardsStaticProductImage(
    (typeof ld?.image === "string" ? ld.image : null) || og?.[1] || null,
  );

  return {
    path,
    slug,
    category,
    name:
      (h1 ? textOf(h1[1] ?? "") : null) ||
      (typeof ld?.name === "string" ? ld.name : null),
    image,
    sku:
      ld?.sku === undefined || ld?.sku === null
        ? null
        : (ld.sku as string | number),
    price: offer?.price != null ? String(offer.price) : null,
    currency:
      typeof offer?.priceCurrency === "string" ? offer.priceCurrency : null,
    setCode: firstField(tables, "Informations générales", "Série"),
    lang: firstField(tables, "Informations générales", "Langue"),
    releaseDate: firstField(tables, "Informations générales", "Date Sortie"),
    declaredCardCount: declared,
    containsPrints,
    containsPrintsIsPreview:
      declared != null && containsPrints.length < declared,
    relatedProducts: relatedProducts(html, path),
    tables,
  };
}
