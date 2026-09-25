/**
 * Naruto Carddass marketplace scrapers.
 */

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import {
  narutoCardDiskFolder,
  narutoDiskCardId,
  parseNarutoCollector,
  narutoFamilyForPrefix,
} from "../identity";
import { narutoCardAbsDir } from "../disk";
import { existingNarutoArtForSource, extFromMagic, saveNarutoFace } from "../disk";
import { NARUTO_PACK_ID, NARUTO_LEGACY_EN_CCG_DISK } from "../identity";
import { loadNarutoCardsIndexFromSqlite } from "../indexStore";
import {
  FRIL_ORIGIN,
  frilRefWithinPublishedRange,
  frilSearchUrl,
  parseFrilSearch,
  type FrilListing,
  foldSurugaCarddassListings,
  loadSurugaCarddassCuratedListings,
  mergeSurugaCarddassListings,
  parseSurugaCarddassSearchHtml,
  SURUGA_CARDDASS_LANG,
  SURUGA_CARDDASS_ORIGIN,
  SURUGA_CARDDASS_SEARCH,
  surugaCarddassFaceUrl,
  surugaJaNamesFromResolvedRows,
  type SurugaCarddassCard,
  chitoroVolumeSetCode,
  japaneseFamilyOf,
  normalizeShopName,
  parseChitoroTitle,
  resolveChitoroIdentity,
  resolveChitoroNameFamily,
  chitoroPsDiskOverride,
  type ChitoroIdentity,
  AVALON_LANG,
  AVALON_ORIGIN,
  avalonFullImageUrl,
  avalonListingUrl,
  avalonProductUrl,
  decodeAvalonHtml,
  parseAvalonNarutoListing,
  type AvalonCard,
  parseStorm3Listing,
  parseStorm3ProductFaceUrl,
  STORM3_LANG,
  STORM3_LISTING_PATH,
  STORM3_SET,
  type Storm3Card,
} from "../parse/marketplace";
import { fileURLToPath } from "node:url";
import { loadSurugaVol1ProbeListings } from "../pipeline/suruga";
import { japaneseReleaseBands } from "../sources/sealed";
import { downloadCardFaceBytes } from "@/providers/shared/cardCatalogue/faceInstall";
import { upsertNarutoAppearances } from "../pipeline";
import ledger from "../curated/sources/ultrajeux-s5.json";
import { promoteAndPurgeNarutoDig } from "@/providers/naruto/shared/promoteNarutoDig";

// ─── shared helpers ─────────────────────────────────────────────────────

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

// ─── scrapeFrilShop ──────────────────────────────────────────────────────────

/**
 * Install Fril / ラクマ seller photos as `art.fril.*`.
 *
 * Bounded on purpose: a fixed set of family queries, a page cap, one request at
 * a time with a delay. Not a crawl of the marketplace — the ledger
 * (`curated/sources/fril-rakuma-jp.json`) says so and this file honours it.
 *
 * Seller photos, not scans: `fril` sits at the bottom of the face ranking, and
 * only ever adds a face to a card that has none worth beating.
 */
export const NARUTO_STAGING_FRIL = path.join("staging", "fril");
export const FRIL_LANG = "ja";

/** One query per printed family — the site indexes the ref in the title. */
export const FRIL_QUERIES: readonly string[] = [
  "ナルト カードゲーム 忍",
  "ナルト カードゲーム 術",
  "ナルト カードゲーム 作",
  "ナルト カードゲーム 依",
  "ナルト カードゲーム 騎",
];

const frilShop_DEFAULT_DELAY_MS = 900;
const DEFAULT_MAX_PAGES = 3;
const frilShop_MIN_BYTES = 8_000;

export type ScrapeFrilOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  maxPages?: number;
  queries?: readonly string[];
  /** Ledger only — never touch `cards/`. */
  stagingOnly?: boolean;
};

async function fetchSearch(url: string): Promise<string | null> {
  try {
    const res = await httpGet<string>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "ja,en;q=0.8",
        Referer: FRIL_ORIGIN,
      },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    return html.length > 2_000 ? html : null;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA fril : recherche HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

async function frilShop_downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/*,*/*",
        Referer: FRIL_ORIGIN,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= frilShop_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export type FrilInstallRow = FrilListing & { diskId: string };

/** Listings whose ref resolves to an id the catalogue already mints. */
export function frilInstallRows(
  items: readonly FrilListing[],
): FrilInstallRow[] {
  const rows: FrilInstallRow[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    // A number outside what Bandai published is a seller typo, not a card.
    if (!frilRefWithinPublishedRange(item.printedRef)) continue;
    const diskId = narutoDiskCardId(item.printedRef);
    if (!diskId || seen.has(diskId)) continue;
    seen.add(diskId);
    rows.push({ ...item, diskId });
  }
  return rows;
}

export async function scrapeFrilNarutoFaces(
  opts: ScrapeFrilOptions = {},
): Promise<{
  listed: number;
  rows: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_FRIL);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? frilShop_DEFAULT_DELAY_MS;
  const maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);
  const queries = opts.queries ?? FRIL_QUERIES;

  console.log(
    "── JA fril / ラクマ → art.fril (photo vendeur, dernier recours)",
  );
  const all: FrilListing[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const totals: Record<string, number | null> = {};
  for (const query of queries) {
    for (let page = 1; page <= maxPages; page += 1) {
      if (delayMs > 0) await sleep(delayMs);
      const html = await fetchSearch(frilSearchUrl(query, page));
      if (!html) break;
      const parsed = parseFrilSearch(html);
      if (page === 1) totals[query] = parsed.total;
      if (!parsed.items.length && !parsed.rejected.length) break;
      all.push(...parsed.items);
      rejected.push(...parsed.rejected);
    }
  }

  const rows = frilInstallRows(all);
  writeFileSync(
    path.join(staging, "listings.json"),
    `${JSON.stringify(
      {
        source: FRIL_ORIGIN,
        queries,
        maxPages,
        capturedAt: new Date().toISOString(),
        totals,
        listed: all.length,
        kept: rows.length,
        rejected,
        cards: rows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(
    `── JA fril : ${all.length} annonces retenues, ${rows.length} ids distincts (${rejected.length} écartées)`,
  );
  if (opts.stagingOnly) {
    return {
      listed: all.length,
      rows: rows.length,
      downloaded: 0,
      skipped: rows.length,
      failed: 0,
    };
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseNarutoCollector(row.printedRef);
    const fallback = parsed ? narutoCardDiskFolder(parsed) : "ninja";
    const cardDir =
      narutoCardAbsDir(cardsDir, row.diskId, FRIL_LANG) ??
      path.join(cardsDir, fallback, row.diskId, FRIL_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "fril")) {
      skip += 1;
      continue;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await frilShop_downloadPhoto(row.imageUrl);
    if (!buf) {
      fail += 1;
      console.log(`JA fril ${row.diskId} FAIL`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "fril",
      lang: FRIL_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      fril: true,
      listed: all.length,
      rows: rows.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return {
    listed: all.length,
    rows: rows.length,
    downloaded: ok,
    skipped: skip,
    failed: fail,
  };
}

// ─── scrapeSurugaCarddass ──────────────────────────────────────────────────────────

/**
 * Install Suruga-ya JP Carddass tabletop scans into `cards/{family}/{ni0001}/ja/`.
 * Cloudflare sits on search HTML; CDN JPEGs do not. Skip Data Carddass.
 */
export const NARUTO_STAGING_SURUGA_CARDDASS = path.join(
  "staging",
  "suruga-ya-carddass",
);

const surugaCarddass_DEFAULT_DELAY_MS = 80;
const DEFAULT_CONCURRENCY = 6;
const surugaCarddass_MIN_BYTES = 4_000;

export type ScrapeSurugaCarddassOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  concurrency?: number;
  root?: string;
  html?: string;
};

export function loadSurugaResolvedJaNames(
  root?: string,
): { diskHint: string; name: string }[] {
  /*
    Same contract as hinokunianFactsPath: `root` is the pack dir when the
    catalogue rebuild passes it. Do not join NARUTO_PACK_ID again.
  */
  const pack = root ?? path.join(dataRoot(), NARUTO_PACK_ID);
  const file = path.join(
    pack,
    NARUTO_STAGING_SURUGA_CARDDASS,
    "resolved-titles.json",
  );
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return surugaJaNamesFromResolvedRows(
      raw as Array<{ title?: string | null; printed?: string | null }>,
    );
  } catch {
    return [];
  }
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const n = Math.max(1, concurrency);
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    }),
  );
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
        Referer: `${SURUGA_CARDDASS_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= surugaCarddass_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeSurugaCarddassCards(
  opts: ScrapeSurugaCarddassOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_SURUGA_CARDDASS);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? surugaCarddass_DEFAULT_DELAY_MS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  console.log("── JA Suruga-ya Carddass → cards/{family}/{id}/ja/");
  const listings = opts.html
    ? parseSurugaCarddassSearchHtml(opts.html)
    : mergeSurugaCarddassListings(
        loadSurugaCarddassCuratedListings(),
        loadSurugaVol1ProbeListings(opts.root),
      );
  let cards = foldSurugaCarddassListings(listings);
  if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit);
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: SURUGA_CARDDASS_SEARCH,
        lang: SURUGA_CARDDASS_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── JA Suruga listing : ${cards.length} faces`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  await mapPool(cards, concurrency, async (card: SurugaCarddassCard) => {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, SURUGA_CARDDASS_LANG) ??
      path.join(cardsDir, "ninja", card.number, SURUGA_CARDDASS_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "suruga")) {
      skip += 1;
      return;
    }
    let buf: Buffer | null = null;
    for (const productId of card.productIds) {
      if (delayMs > 0) await sleep(delayMs);
      buf = await downloadBytes(surugaCarddassFaceUrl(productId));
      if (buf) break;
    }
    if (!buf) {
      fail += 1;
      console.log(`JA suruga ${card.number} FAIL`);
      return;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "suruga",
      lang: SURUGA_CARDDASS_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  });

  console.log(
    JSON.stringify({
      surugaCarddass: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: cards.length, downloaded: ok, skipped: skip, failed: fail };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  scrapeSurugaCarddassCards().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// ─── scrapeChitoroshop ──────────────────────────────────────────────────────────

/**
 * Moisson de chitoroshop → `data/naruto/carddass/staging/chitoroshop/`.
 *
 * La collection entière tient dans **une** requête : Shopify sert
 * `products.json?limit=250`, et la boutique en compte 227. Aucune raison de
 * paginer ni de marteler.
 *
 * Ce qu'on vient chercher, ce sont les **scans à plat en 1414×2000** : le
 * catalogue japonais manque de 703 faces, et cette boutique en a plusieurs par
 * carte. L'identification est le travail difficile — la fiche ne dit pas la
 * famille — et vit dans `parseChitoroshop.ts`.
 *
 * Rien n'est versé au catalogue ici. On écrit un relevé et des fichiers de
 * staging ; le versement se décide après, avec la corroboration des autres
 * sources, comme pour toutes les moissons de ce pack.
 */
const COLLECTION =
  "https://chitoroshop.com/collections/naruto-tcg-cartes-a-lunite-japonaises-naruto/products.json?limit=250";

export const CHITOROSHOP_STAGING = "chitoroshop";

export type ShopifyProduct = {
  handle: string;
  title: string;
  body_html?: string;
  images?: { src: string; position?: number }[];
};

export type ChitoroRow = ChitoroIdentity & {
  handle: string;
  title: string;
  images: string[];
};

export type ChitoroHarvest = {
  products: number;
  identified: ChitoroRow[];
  /** Titres qui ne sont pas « Nom NNN » : autocollants, Data Carddass. */
  notCards: string[];
  /** Cartes dont aucun des deux signaux ne parle. */
  unresolved: string[];
  /** Les deux signaux se contredisent — jamais vu, et jamais tranché. */
  contradictions: string[];
};

export function stagingDir(root?: string): string {
  return path.join(
    root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
    CHITOROSHOP_STAGING,
  );
}

/**
 * `(nom anglais, numéro)` → famille japonaise, depuis les titres du catalogue.
 *
 * L'anglais et lui seul : c'est la langue de la boutique, et mêler le français
 * ou le japonais fait retomber le nombre de résolutions de 57 à 35 en créant
 * des homonymies entre familles.
 */
export function englishNameIndex(
  titles: readonly {
    family: string;
    number: number;
    lang: string;
    fullName: string | null;
  }[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const row of titles) {
    if (row.lang.toLowerCase() !== "en" || !row.fullName) continue;
    const family = japaneseFamilyOf(row.family);
    if (!family) continue;
    const key = `${normalizeShopName(row.fullName)}|${row.number}`;
    const set = index.get(key) ?? new Set<string>();
    set.add(family);
    index.set(key, set);
  }
  return index;
}

/** La famille que le volume désigne, quand il n'y en a qu'une possible. */
export function familyFromVolume(
  setCode: string | null,
  number: number,
): string | null {
  if (!setCode) return null;
  const hits = japaneseReleaseBands(setCode).filter(
    (band) => number >= band.from && number <= band.to,
  );
  return hits.length === 1 ? hits[0].family : null;
}

export function identifyChitoroProducts(input: {
  products: readonly ShopifyProduct[];
  nameIndex: Map<string, Set<string>>;
}): ChitoroHarvest {
  const identified: ChitoroRow[] = [];
  const notCards: string[] = [];
  const unresolved: string[] = [];
  const contradictions: string[] = [];

  for (const product of input.products) {
    const parsed = parseChitoroTitle(product.title);
    if (!parsed) {
      notCards.push(product.title);
      continue;
    }
    const byName = resolveChitoroNameFamily(
      input.nameIndex,
      parsed.name,
      parsed.number,
    );
    const byVolume = familyFromVolume(
      chitoroVolumeSetCode(`${product.title} ${product.body_html ?? ""}`),
      parsed.number,
    );
    const identity = resolveChitoroIdentity({
      number: parsed.number,
      byName,
      byVolume,
    });
    if (!identity) {
      if (byName && byVolume) contradictions.push(product.title);
      else unresolved.push(product.title);
      continue;
    }
    identified.push({
      ...identity,
      handle: product.handle,
      title: product.title,
      images: (product.images ?? []).map((image) => image.src),
    });
  }

  return {
    products: input.products.length,
    identified,
    notCards,
    unresolved,
    contradictions,
  };
}

export async function fetchChitoroProducts(): Promise<ShopifyProduct[]> {
  const response = await httpGet(COLLECTION, {
    headers: { "User-Agent": UA },
    timeout: 30_000,
  });
  const body = (response as { data?: unknown }).data;
  const parsed = (typeof body === "string" ? JSON.parse(body) : body) as {
    products?: ShopifyProduct[];
  };
  return parsed.products ?? [];
}

/** Écrit le relevé. Les visuels se rapatrient dans une seconde passe. */
export function writeChitoroLedger(
  harvest: ChitoroHarvest,
  root?: string,
): string {
  const dir = stagingDir(root);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "identified.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: COLLECTION,
        observed: new Date().toISOString().slice(0, 10),
        products: harvest.products,
        counts: {
          identified: harvest.identified.length,
          byBothSignals: harvest.identified.filter((r) => r.by === "both")
            .length,
          byNameOnly: harvest.identified.filter((r) => r.by === "name").length,
          byVolumeOnly: harvest.identified.filter((r) => r.by === "volume")
            .length,
          unresolved: harvest.unresolved.length,
          notCards: harvest.notCards.length,
          contradictions: harvest.contradictions.length,
        },
        identified: harvest.identified,
        unresolved: harvest.unresolved,
        notCards: harvest.notCards,
        contradictions: harvest.contradictions,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

export function chitoroStagingExists(root?: string): boolean {
  return existsSync(stagingDir(root));
}

/**
 * Rapatrie le scan de référence de chaque carte identifiée.
 *
 * **La première image, et elle seule.** Vérifié à l'œil sur trois produits, un
 * par famille : `images[0]` est le scan à plat de la face, les suivantes sont
 * les photos d'inventaire de la boutique — un exemplaire par photo, marqué d'une
 * étiquette « #N025 » incrustée. Le registre affirmait l'inverse ; c'est corrigé.
 *
 * Les octets d'origine sont écrits tels quels, sans réencodage : la source sert
 * du JPEG 1414×2000, et le classement par pixels décidera ensuite si ce scan
 * l'emporte sur celui déjà en place.
 */
export async function downloadChitoroFaces(input: {
  rows: readonly ChitoroRow[];
  /** Dossier `cards/` du pack. */
  cardsDir: string;
  force?: boolean;
  delayMs?: number;
  onProgress?: (message: string) => void;
}): Promise<{ written: number; skipped: number; failed: string[] }> {
  const delay = input.delayMs ?? 700;
  let written = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const row of input.rows) {
    const src = row.images[0];
    if (!src) continue;
    const retailId = `${row.family}${String(row.number).padStart(4, "0")}`;
    const cardId = chitoroPsDiskOverride(retailId) ?? retailId;
    const diskFolder = narutoFamilyForPrefix(row.family);
    if (!diskFolder) continue;
    const dir = path.join(
      input.cardsDir,
      diskFolder,
      cardId,
      "ja",
    );
    if (!input.force && existsSync(path.join(dir, "art.chitoroshop.jpg"))) {
      skipped += 1;
      continue;
    }
    try {
      const response = await httpGet(src, {
        headers: { "User-Agent": UA },
        responseType: "arraybuffer",
        timeout: 30_000,
      });
      const data = (response as { data?: ArrayBuffer }).data;
      if (!data) throw new Error("vide");
      mkdirSync(dir, { recursive: true });
      const saved = await saveNarutoFace({
        cardDir: dir,
        buf: Buffer.from(data),
        source: "chitoroshop",
        lang: "ja",
        force: input.force,
      });
      if (saved === "ok") written += 1;
      else skipped += 1;
      input.onProgress?.(`   ${cardId} ← ${row.by}`);
    } catch {
      failed.push(cardId);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  return { written, skipped, failed };
}

type EnTitleRow = {
  family: string;
  number: number;
  lang: string;
  fullName: string;
};

/** EN CCG titles from catalog.sqlite → chitoro name index (`n`→`ni`, …). */
export function loadEnTitleRowsFromIndex(root: string): EnTitleRow[] {
  const index = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID, {
    dbPath: path.join(root, "catalog.sqlite"),
  });
  if (!index) return [];
  const rows: EnTitleRow[] = [];
  for (const entry of Object.values(index.cards)) {
    const name = entry.langs?.en?.name?.trim();
    const card = entry.card?.trim();
    if (!name || !card) continue;
    const id = parseNarutoCollector(card);
    if (!id) continue;
    const family = japaneseFamilyOf(id.printedPrefix);
    if (!family) continue;
    rows.push({
      family: id.printedPrefix.toLowerCase(),
      number: id.number,
      lang: "en",
      fullName: name,
    });
  }
  return rows;
}

export type ScrapeChitoroshopOptions = {
  force?: boolean;
  root?: string;
  delayMs?: number;
  limit?: number;
  /** Ledger only — skip `cards/` writes. */
  stagingOnly?: boolean;
};

export async function scrapeNarutoChitoroshopCards(
  options: ScrapeChitoroshopOptions = {},
): Promise<void> {
  const root = path.join(options.root ?? dataRoot(), NARUTO_PACK_ID);
  const cardsDir = path.join(root, "cards");
  console.log(
    "── chitoroshop JA scans → cards/{family}/{ni####}/ja/art.chitoroshop.*",
  );
  const products = await fetchChitoroProducts();
  const nameIndex = englishNameIndex(loadEnTitleRowsFromIndex(root));
  let harvest = identifyChitoroProducts({ products, nameIndex });
  if (options.limit && options.limit > 0) {
    harvest = {
      ...harvest,
      identified: harvest.identified.slice(0, options.limit),
    };
  }
  const ledger = writeChitoroLedger(harvest, root);
  console.log(
    JSON.stringify({
      chitoroshop: true,
      products: harvest.products,
      identified: harvest.identified.length,
      unresolved: harvest.unresolved.length,
      ledger,
    }),
  );
  if (options.stagingOnly || harvest.identified.length === 0) return;
  const result = await downloadChitoroFaces({
    rows: harvest.identified,
    cardsDir,
    force: options.force,
    delayMs: options.delayMs,
    onProgress: (message) => console.log(message),
  });
  console.log(
    JSON.stringify({
      chitoroshopFaces: true,
      written: result.written,
      skipped: result.skipped,
      failed: result.failed.length,
    }),
  );
}

// ─── scrapeAvalonShop ──────────────────────────────────────────────────────────

/**
 * Install カードショップ アヴァロン shop photos as `art.avalon.*`.
 *
 * The JA hole is the catalogue's biggest (705 named prints without a face on
 * 2026-08-19) and every archive host is exhausted. This shop is the only live
 * one that names each card by its printed ref, so it can be joined without
 * guessing. What it serves is a 265×400 photo, not a scan: it ranks below
 * nikita / carddas / suruga and is only worth writing where nothing else is.
 *
 * Bounded on purpose — one category page, no crawl of the shop.
 */
export const NARUTO_STAGING_AVALON = path.join("staging", "avalon-shop");

const avalonShop_DEFAULT_DELAY_MS = 250;
const avalonShop_MIN_BYTES = 3_000;

export type ScrapeAvalonOptions = {
  force?: boolean;
  limit?: number;
  delayMs?: number;
  root?: string;
  /** Write staging + ledger, never touch `cards/`. */
  stagingOnly?: boolean;
};

export type AvalonInstallRow = AvalonCard & { diskId: string };

/** Rows whose printed ref resolves to a disk id we already mint. */
export function avalonInstallRows(
  cards: readonly AvalonCard[],
): AvalonInstallRow[] {
  const rows: AvalonInstallRow[] = [];
  for (const card of cards) {
    const diskId = narutoDiskCardId(card.printedRef);
    if (!diskId) continue;
    rows.push({ ...card, diskId });
  }
  return rows;
}

async function fetchListing(): Promise<string | null> {
  try {
    const res = await httpGet<ArrayBuffer>(avalonListingUrl(), {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,*/*",
        "Accept-Language": "ja,en;q=0.8",
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html = decodeAvalonHtml(new Uint8Array(res.data as ArrayBuffer));
    if (html.length < 400) return null;
    return html;
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number } };
    console.warn(
      `── JA avalon : listing HTTP ${err.response?.status ?? "fail"} — ${err.message ?? error}`,
    );
    return null;
  }
}

async function avalonShop_downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/*,*/*",
        Referer: avalonListingUrl(),
      },
      responseType: "arraybuffer",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) === ".bin") return null;
    return buf.byteLength >= avalonShop_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeAvalonNarutoFaces(
  opts: ScrapeAvalonOptions = {},
): Promise<{
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
}> {
  const root = packRoot(opts.root);
  const staging = path.join(root, NARUTO_STAGING_AVALON);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = opts.force === true;
  const delayMs = opts.delayMs ?? avalonShop_DEFAULT_DELAY_MS;

  console.log(
    "── JA avalon shop → art.avalon (photo boutique, dernier recours)",
  );
  const html = await fetchListing();
  if (!html) {
    console.warn("── JA avalon : listing absente, on s'arrête là");
    return { listed: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  writeFileSync(path.join(staging, "listing.html"), html, "utf8");

  let rows = avalonInstallRows(parseAvalonNarutoListing(html));
  if (opts.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: avalonListingUrl(),
        origin: AVALON_ORIGIN,
        lang: AVALON_LANG,
        capturedAt: new Date().toISOString(),
        ingest: "faces",
        note: "Photos boutique 265×400 — titres JP exploitables, images en dernier recours.",
        cards: rows.map((row) => ({
          ...row,
          product: avalonProductUrl(row.pid),
          image: avalonFullImageUrl(row.pid),
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`── JA avalon listing : ${rows.length} singles`);
  if (opts.stagingOnly) {
    return {
      listed: rows.length,
      downloaded: 0,
      skipped: rows.length,
      failed: 0,
    };
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const row of rows) {
    const parsed = parseNarutoCollector(row.printedRef);
    const fallbackFolder = parsed ? narutoCardDiskFolder(parsed) : "ninja";
    const cardDir =
      narutoCardAbsDir(cardsDir, row.diskId, AVALON_LANG) ??
      path.join(cardsDir, fallbackFolder, row.diskId, AVALON_LANG);
    if (!force && existingNarutoArtForSource(cardDir, "avalon")) {
      skip += 1;
      continue;
    }
    if (delayMs > 0) await sleep(delayMs);
    const buf = await avalonShop_downloadPhoto(avalonFullImageUrl(row.pid));
    if (!buf) {
      fail += 1;
      console.log(`JA avalon ${row.diskId} FAIL`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "avalon",
      lang: AVALON_LANG,
      force,
    });
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      avalonShop: true,
      listed: rows.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
  return { listed: rows.length, downloaded: ok, skipped: skip, failed: fail };
}

// ─── scrapeStorm3 ──────────────────────────────────────────────────────────

/**
 * Install Bandai USA CCG Series 28 (Ultimate Ninja Storm 3) into the Naruto
 * pack: `cards/s28/en/{n1621}/art.stop2shop.*`.
 *
 * Staging: `data/naruto/carddass/staging/stop2shop-uns3/` (listing + product HTML +
 * ledger). Shop host is not the TCG Cards tarpit — still sequential.
 */
const ORIGIN = "https://stop2shop.com";
export const NARUTO_STAGING_STORM3 = path.join("staging", "stop2shop-uns3");

const storm3_DEFAULT_DELAY_MS = 400;

export type ScrapeStorm3Options = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  delayMs?: number;
  root?: string;
};

function storm3_stagingDir(packDir: string): string {
  return path.join(packDir, NARUTO_STAGING_STORM3);
}

/**
 * Ledger path. `packDir` is the pack root (`…/naruto/carddass`), the same value
 * `scrapeCards` already resolved — do not wrap it in `naruto/carddass` again.
 */
export function storm3LedgerPath(packDir?: string): string {
  return path.join(packDir ?? packRoot(), NARUTO_STAGING_STORM3, "cards.json");
}

export function loadStorm3Ledger(packDir?: string): Storm3Card[] {
  const files = packDir
    ? [storm3LedgerPath(packDir)]
    : [
        storm3LedgerPath(path.join(dataRoot(), NARUTO_PACK_ID)),
        storm3LedgerPath(path.join(dataRoot(), NARUTO_LEGACY_EN_CCG_DISK)),
      ];
  for (const file of files) {
    const cards = readStorm3LedgerFile(file);
    if (cards.length) return cards;
  }
  return [];
}

function readStorm3LedgerFile(file: string): Storm3Card[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter(
      (row): row is Storm3Card =>
        !!row &&
        typeof row === "object" &&
        typeof (row as Storm3Card).number === "string" &&
        typeof (row as Storm3Card).name === "string",
    );
  } catch {
    return [];
  }
}

async function fetchHtml(
  url: string,
  dest: string,
  force: boolean,
): Promise<string | null> {
  if (!force && existsSync(dest) && readFileSync(dest, "utf8").length > 400) {
    return readFileSync(dest, "utf8");
  }
  try {
    const res = await httpGet<string>(url, {
      headers: { "User-Agent": UA },
      responseType: "text",
      timeout: 30_000,
      validateStatus: (status) => status === 200,
    });
    const html =
      typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (html.length < 400) return null;
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, html, "utf8");
    return html;
  } catch {
    return null;
  }
}

async function downloadFace(url: string): Promise<Buffer | null> {
  return downloadCardFaceBytes(url, { minBytes: 8_000, timeoutMs: 30_000 });
}

export async function scrapeNarutoStorm3Cards(
  options: ScrapeStorm3Options = {},
): Promise<void> {
  const root = packRoot(options.root);
  const staging = storm3_stagingDir(root);
  const cardsDir = path.join(root, "cards");
  mkdirSync(staging, { recursive: true });
  const force = options.force === true;
  const delayMs = options.delayMs ?? storm3_DEFAULT_DELAY_MS;

  console.log(
    "── Storm 3 (CCG Bandai USA s28) stop2shop → cards/ninja|jutsu|mission/{n|j|m}####/en/",
  );
  const listingHtml = await fetchHtml(
    `${ORIGIN}${STORM3_LISTING_PATH}`,
    path.join(staging, "listing.html"),
    force,
  );
  if (!listingHtml) {
    console.warn("── Storm 3 : listing absent, on continue");
    return;
  }
  let cards = parseStorm3Listing(listingHtml);
  if (options.limit && options.limit > 0) cards = cards.slice(0, options.limit);
  console.log(`── Storm 3 listing : ${cards.length} singles`);

  mkdirSync(path.join(staging, "pages"), { recursive: true });
  writeFileSync(
    path.join(staging, "cards.json"),
    `${JSON.stringify(
      {
        source: `${ORIGIN}${STORM3_LISTING_PATH}`,
        set: STORM3_SET,
        lang: STORM3_LANG,
        capturedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (options.cdxOnly) return;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let waited = false;
  for (const card of cards) {
    const cardDir =
      narutoCardAbsDir(cardsDir, card.number, STORM3_LANG) ??
      path.join(cardsDir, STORM3_SET, STORM3_LANG, card.number);
    if (!force && existingNarutoArtForSource(cardDir, "stop2shop")) {
      skip += 1;
      upsertNarutoAppearances(root, [
        {
          diskId: card.number,
          lang: STORM3_LANG,
          appearanceSet: STORM3_SET,
        },
      ]);
      continue;
    }
    if (delayMs > 0) {
      if (waited) await sleep(delayMs);
      else waited = true;
    }
    const pageHtml = await fetchHtml(
      `${ORIGIN}${card.productPath}`,
      path.join(staging, "pages", `${card.number}.html`),
      force,
    );
    const faceUrl = pageHtml ? parseStorm3ProductFaceUrl(pageHtml) : null;
    if (!faceUrl) {
      fail += 1;
      console.log(`Storm 3 ${card.number} FAIL (pas de scan)`);
      continue;
    }
    const buf = await downloadFace(faceUrl);
    if (!buf) {
      fail += 1;
      console.log(`Storm 3 ${card.number} FAIL (image)`);
      continue;
    }
    const ext = extFromMagic(buf);
    if (ext === ".bin") {
      fail += 1;
      console.log(`Storm 3 ${card.number} FAIL (scan illisible)`);
      continue;
    }
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "stop2shop",
      lang: STORM3_LANG,
      force,
    });
    upsertNarutoAppearances(root, [
      {
        diskId: card.number,
        lang: STORM3_LANG,
        appearanceSet: STORM3_SET,
      },
    ]);
    if (saved === "skip") skip += 1;
    else ok += 1;
  }

  console.log(
    JSON.stringify({
      storm3: true,
      listed: cards.length,
      downloaded: ok,
      skipped: skip,
      failed: fail,
    }),
  );
}

// ─── scrapeUltrajeuxS5 ──────────────────────────────────────────────────────────

/**
 * Six S5 faces that carddass.fr CDX never crawled. Ultrajeux copied the
 * official scans under `/images/naruto/scan/normal/vf/serie_5/`.
 * Do not dump the rest of that folder — those are already `art.carddass`.
 */
const LANG = "fr";
const ultrajeuxS5_MIN_BYTES = 4_000;

export const NARUTO_STAGING_ULTRAJEUX = path.join("staging", "ultrajeux");

export type ScrapeUltrajeuxS5Options = {
  force?: boolean;
  root?: string;
};

export function ultrajeuxWaybackUrl(file: string, timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${ledger.waybackHost}${file}`;
}

async function downloadJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Accept: "image/jpeg,image/*,*/*;q=0.8",
      },
      responseType: "arraybuffer",
      timeout: 45_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (extFromMagic(buf) !== ".jpg") return null;
    return buf.byteLength >= ultrajeuxS5_MIN_BYTES ? buf : null;
  } catch {
    return null;
  }
}

export async function scrapeUltrajeuxS5Holes(
  opts: ScrapeUltrajeuxS5Options = {},
): Promise<{ downloaded: number; skipped: number; failed: string[] }> {
  const root = packRoot(opts.root);
  const cardsDir = path.join(root, "cards");
  const staging = path.join(root, NARUTO_STAGING_ULTRAJEUX, "serie_5");
  mkdirSync(staging, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  const failed: string[] = [];

  console.log("── Ultrajeux S5 holes → art.ultrajeux");
  for (const hole of ledger.holes) {
    const cardDir = narutoCardAbsDir(cardsDir, hole.number, LANG);
    if (!cardDir) {
      failed.push(hole.number);
      continue;
    }
    if (!opts.force && existingNarutoArtForSource(cardDir, "ultrajeux")) {
      skipped += 1;
      continue;
    }
    const url = ultrajeuxWaybackUrl(hole.file, hole.timestamp);
    const buf = await downloadJpeg(url);
    if (!buf) {
      failed.push(hole.number);
      console.log(`Ultrajeux ${hole.number} FAIL`);
      continue;
    }
    writeFileSync(path.join(staging, hole.file), buf);
    const saved = await saveNarutoFace({
      cardDir,
      buf,
      source: "ultrajeux",
      lang: LANG,
      force: opts.force,
    });
    if (saved === "skip") skipped += 1;
    else downloaded += 1;
  }
  console.log(
    JSON.stringify({
      ultrajeuxS5: true,
      downloaded,
      skipped,
      failed,
    }),
  );
  if (!opts.force && failed.length === 0 && downloaded + skipped > 0) {
    promoteAndPurgeNarutoDig({
      packId: NARUTO_PACK_ID,
      artefactId: "faces:ultrajeux-s5",
      stagingRel: "ultrajeux",
    });
  }
  return { downloaded, skipped, failed };
}
