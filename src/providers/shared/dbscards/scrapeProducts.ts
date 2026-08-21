/**
 * Crawl dbscards product listings + deterministic/mixed fiches into
 * `data/<pack>/staging/dbscards-products/`.
 *
 * Sequential — this host banned us for an evening when a pass went parallel
 * (same rule as `scrapeList`). Skip HTML already on disk unless `force`.
 * Accessories are never requested. Displays are listed, not opened.
 * Boosters are opened for the 15-tile preview the site already labels as
 * such — date, série, prix, and those tiles. The Bandai series is not
 * the pack; `completePrints` leaves that preview alone.
 *
 * One software family, many hosts: pack + site come from `sites.ts`.
 *
 * The fiche grid is a 15-tile preview. When the pack's `catalog.sqlite` is
 * passed in, decks and exclusive boxes are completed from the Bandai series
 * — see `completePrints`. Booster / lottery-pack pools stay on the preview.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { foilPackDataDir } from "@/lib/runtimeData";
import { dataPackPath } from "@/providers/shared/catalogCorpus";
import { refreshPackSetLogos } from "@/providers/shared/packOwner";
import { ingestSealedProducts } from "@/providers/shared/sealedProducts/ingest";

import { loadDbscardsCatalogIndex } from "./catalogIndex";
import {
  completeProductContainsPrints,
  type DbscardsCatalogIndex,
} from "./completePrints";
import {
  buildDbscardsIndex,
  DBSCARDS_SITES,
  lookupDbscardsEntry,
  type DbscardsIndex,
  type DbscardsIndexEntry,
  type DbscardsSite,
} from "./list";
import {
  dbscardsProductListingUrl,
  dbscardsProductPageUrl,
  parseDbscardsProductListing,
  parseDbscardsProductPage,
  type DbscardsProductListingRow,
  type DbscardsProductPage,
} from "./parseProducts";
import { dbscardsIndexPath } from "./scrapeList";
import {
  isTcgCardsSiteId,
  tcgCardsDetailCategories,
  tcgCardsListingCategories,
  tcgCardsSite,
  type TcgCardsSiteId,
} from "./sites";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const PAGE_TIMEOUT_MS = 60_000;
const DEFAULT_DELAY_MS = 300;
/** Boosters listing measured 4 pages; stop after this many empties. */
const LISTING_EMPTY_STREAK_STOP = 2;
const LISTING_MAX_PAGES = 20;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function dbscardsProductsDir(
  packId: string,
  stagingFolder = "dbscards-products",
): string {
  return path.join(foilPackDataDir(packId), "staging", stagingFolder);
}

export type ScrapeDbscardsProductsResult = {
  listed: number;
  detail: number;
  printsLinked: number;
  fetched: number;
  /** Products whose preview was unioned with a Bandai series. */
  catalogCompleted: number;
  dir: string;
};

async function readHtml(opts: {
  url: string;
  dest: string;
  force: boolean;
  offline: boolean;
  /** Only called before a real GET — cache hits must not wait. */
  beforeFetch?: () => Promise<void>;
}): Promise<{ html: string; fetched: boolean } | null> {
  if (!opts.force && existsSync(opts.dest)) {
    const html = readFileSync(opts.dest, "utf8");
    if (html.length > 500) return { html, fetched: false };
  }
  if (opts.offline) return null;
  await opts.beforeFetch?.();
  const res = await httpGet<string>(opts.url, {
    headers: { "User-Agent": UA },
    responseType: "text",
    timeout: PAGE_TIMEOUT_MS,
    validateStatus: (status) => status === 200,
  });
  const html = typeof res.data === "string" ? res.data : String(res.data);
  mkdirSync(path.dirname(opts.dest), { recursive: true });
  writeFileSync(opts.dest, html, "utf8");
  return { html, fetched: true };
}

function writeReadme(dir: string, packId: string): void {
  writeFileSync(
    path.join(dir, "README.md"),
    `# products — ${packId}

Écrit par le **Sync admin** du pack (famille TCG Cards : dbscards, lorcards,
pkmcards, opecards, …). **Pas un grab manuel.**

- \`listings.json\` — SKU (displays en index seul ; pages \`/2\`, \`/3\`…).
- \`products.json\` — fiches ouvertes + \`containsPrints\`.
- HTML sous \`listings/\` et \`pages/\` — reprise sans re-télécharger.

La grille fiche est un aperçu (15 tuiles), y compris sur un booster —
le site le dit. Accessoires exclus. Pas de packshot CDN. Displays =
index seul.
`,
    "utf8",
  );
}

function loadPackCardIndex(packId: string, lang: string): DbscardsIndex | null {
  const file = dbscardsIndexPath(packId, lang);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const entries = Array.isArray(raw)
      ? raw
      : ((raw as { cards?: DbscardsIndexEntry[] }).cards ?? []);
    return buildDbscardsIndex(entries as DbscardsIndexEntry[]);
  } catch {
    return null;
  }
}

export async function scrapeDbscardsProducts(opts: {
  packId: string;
  site?: DbscardsSite;
  force?: boolean;
  offline?: boolean;
  delayMs?: number;
  /** Cap detail fiches (debug). Listings still run. */
  limit?: number;
  listingCategories?: readonly string[];
  detailCategories?: readonly string[];
  /**
   * Bandai series from the pack's `catalog.sqlite`. Completes decks and
   * exclusive boxes past the 15-tile preview. Absent = preview only.
   */
  catalog?: DbscardsCatalogIndex | null;
  /** Locale of the dbscards index used to recover real card slugs. */
  indexLang?: string;
  /** Folder under `data/<pack>/staging/`. Default `dbscards-products`. */
  stagingFolder?: string;
  onProgress?: (message: string) => void;
}): Promise<ScrapeDbscardsProductsResult> {
  const site = opts.site ?? DBSCARDS_SITES.masters;
  const force = opts.force === true;
  const offline = opts.offline === true;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const family = isTcgCardsSiteId(site.id) ? tcgCardsSite(site.id) : null;
  const listingCategories =
    opts.listingCategories ??
    tcgCardsListingCategories(family?.id ?? "masters");
  const detailCategories = new Set(
    opts.detailCategories ?? tcgCardsDetailCategories(family?.id ?? "masters"),
  );
  const dir = dbscardsProductsDir(
    opts.packId,
    opts.stagingFolder ?? family?.stagingFolder ?? "dbscards-products",
  );
  mkdirSync(dir, { recursive: true });
  const catalog = opts.catalog ?? null;
  const indexLang = (opts.indexLang ?? family?.indexLang ?? "fr").toLowerCase();
  const cardIndex = loadPackCardIndex(opts.packId, indexLang);
  const lookup = cardIndex
    ? (ref: string) => {
        const entry = lookupDbscardsEntry(cardIndex, ref);
        if (!entry) return null;
        return {
          slug: entry.slug,
          path: `/cards/${entry.slug}`,
          sku: entry.sku,
          name: entry.name,
        };
      }
    : undefined;

  const listings: DbscardsProductListingRow[] = [];
  const products: DbscardsProductPage[] = [];
  let fetched = 0;
  let waited = false;
  let catalogCompleted = 0;

  const beforeFetch = async () => {
    if (delayMs <= 0) return;
    if (!waited) {
      waited = true;
      return;
    }
    await sleep(delayMs);
  };

  for (const category of listingCategories) {
    const seen = new Set<string>();
    let empty = 0;
    for (let pageNum = 1; pageNum <= LISTING_MAX_PAGES; pageNum += 1) {
      const dest = path.join(
        dir,
        "listings",
        pageNum <= 1 ? `${category}.html` : `${category}-${pageNum}.html`,
      );
      try {
        const page = await readHtml({
          url: dbscardsProductListingUrl(site.origin, category, pageNum),
          dest,
          force,
          offline,
          beforeFetch,
        });
        if (!page) {
          if (pageNum === 1) {
            opts.onProgress?.(`listing ${category} : absent (offline)`);
          }
          break;
        }
        if (page.fetched) fetched += 1;
        const rows = parseDbscardsProductListing(page.html, category).map(
          (row) => ({
            ...row,
            detailArchived: detailCategories.has(category),
          }),
        );
        const fresh = rows.filter((row) => {
          if (seen.has(row.path)) return false;
          seen.add(row.path);
          return true;
        });
        listings.push(...fresh);
        opts.onProgress?.(
          `listing ${category}` +
            (pageNum > 1 ? ` p${pageNum}` : "") +
            ` : ${fresh.length} produits` +
            (page.fetched ? "" : " (cache)"),
        );
        if (fresh.length === 0) {
          empty += 1;
          if (empty >= LISTING_EMPTY_STREAK_STOP) break;
          continue;
        }
        empty = 0;
      } catch {
        opts.onProgress?.(
          `listing ${category}` +
            (pageNum > 1 ? ` p${pageNum}` : "") +
            ` : échec, on continue`,
        );
        empty += 1;
        if (empty >= LISTING_EMPTY_STREAK_STOP) break;
      }
    }
  }

  const detailRows = listings.filter((row) => row.detailArchived);
  const capped =
    opts.limit != null ? detailRows.slice(0, opts.limit) : detailRows;

  for (const row of capped) {
    const dest = path.join(dir, "pages", row.category, `${row.slug}.html`);
    try {
      const page = await readHtml({
        url: dbscardsProductPageUrl(site.origin, row.path),
        dest,
        force,
        offline,
        beforeFetch,
      });
      if (!page) {
        opts.onProgress?.(`${row.path} : absent (offline)`);
        continue;
      }
      if (page.fetched) fetched += 1;
      const parsed = parseDbscardsProductPage(
        page.html,
        row.path,
        row.category,
      );
      if (!parsed.image) parsed.image = row.image;
      const completed = completeProductContainsPrints(parsed, catalog, lookup);
      if (completed.containsPrints.length > parsed.containsPrints.length) {
        catalogCompleted += 1;
      }
      products.push(completed);
    } catch {
      opts.onProgress?.(`${row.path} : échec, on continue`);
    }
  }

  const printsLinked = products.reduce(
    (sum, product) => sum + product.containsPrints.length,
    0,
  );
  const meta = {
    capturedAt: new Date().toISOString(),
    origin: site.origin,
    pack: opts.packId,
    listingCount: listings.length,
    productCount: products.length,
    printsLinked,
    httpFetchesThisRun: fetched,
    catalogCompleted,
    note:
      "Graphe produit→cartes (famille TCG Cards). Grille fiche = aperçu " +
      "15 tuiles. Boosters = fiche + aperçu ; displays = index seul. " +
      (catalog
        ? "Decks / coffrets exclusifs complétés depuis catalog.sqlite. "
        : "Catalogue cartes non joint. ") +
      "Accessoires exclus.",
  };

  writeFileSync(
    path.join(dir, "listings.json"),
    `${JSON.stringify({ meta, products: listings }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(dir, "products.json"),
    `${JSON.stringify({ meta, products }, null, 2)}\n`,
    "utf8",
  );
  writeReadme(dir, opts.packId);
  /*
    Les logos de set se rafraîchissent avant l'ingest scellé, et **le pack sait
    le faire** : ce code n'a pas à connaître les jeux un par un. Il branchait
    ici sur deux identifiants, ce qui l'obligeait à importer deux providers —
    du code partagé qui cite ses appelants.
  */
  const logoNote = await refreshPackSetLogos(opts.packId, {
    force: opts.force,
    offline: opts.offline,
  });
  if (logoNote) opts.onProgress?.(logoNote);
  await ingestSealedProducts(opts.packId);

  return {
    listed: listings.length,
    detail: products.length,
    printsLinked,
    fetched,
    catalogCompleted,
    dir,
  };
}

/**
 * Crawl one row of the TCG Cards family. Categories, staging folder, and
 * optional Bandai catalog join come from `sites.ts`.
 */
export async function scrapeTcgCardsProducts(
  siteId: TcgCardsSiteId,
  opts: {
    force?: boolean;
    offline?: boolean;
    delayMs?: number;
    limit?: number;
    catalog?: DbscardsCatalogIndex | null;
    onProgress?: (message: string) => void;
  } = {},
): Promise<ScrapeDbscardsProductsResult> {
  const site = tcgCardsSite(siteId);
  if (!site.packId) {
    throw new Error(
      `tcgcards: ${siteId} has no pack yet — register a packId before crawling`,
    );
  }
  const catalog =
    opts.catalog !== undefined
      ? opts.catalog
      : site.catalogJoin
        ? loadDbscardsCatalogIndex({
            dbPath: dataPackPath(site.packId, "catalog.sqlite"),
            lang: site.indexLang ?? "fr",
          })
        : null;
  return scrapeDbscardsProducts({
    packId: site.packId,
    site: {
      id: site.id,
      origin: site.origin,
      lists: site.lists ?? {},
    },
    force: opts.force,
    offline: opts.offline,
    delayMs: opts.delayMs,
    limit: opts.limit,
    catalog,
    indexLang: site.indexLang,
    stagingFolder: site.stagingFolder,
    onProgress: opts.onProgress,
  });
}
