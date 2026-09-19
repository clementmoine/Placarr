/**
 * Data Carddass harvest — Chitoroshop crawl, nao-yoshi Seesaa, official
 * checklist assembly, Suruga live search.
 *
 * Merged from: harvestChitoroshop, harvest/chitoroshop, harvestNaoYoshiSeesaa,
 * harvestOfficialChecklist, harvestSuruga.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { httpGet } from "@/lib/http/httpClient";
import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";
import { packStagingDir } from "@/lib/packPaths";

import {
  dataCarddassChecklistPath,
  readDataCarddassChecklist,
  type DataCarddassChecklistCard,
} from "./pipeline/ledgers";
import {
  decodeOfficialCardlistBytes,
  looksLikeMojibakeJa,
  mergeNaoYoshiSeesaaRows,
  NAO_YOSHI_SEESAA_ARTICLES,
  NAO_YOSHI_SEESAA_ORIGIN,
  normalizeOfficialPrinted,
  parseBattleCardCsv,
  parseCrossCardlistHtml,
  parseFormationCardlistHtml,
  parseMissionCardlistHtml,
  parseNaoYoshiSeesaaBytes,
  parseSurugaDataCarddassPrintedFromTitle,
  type NaoYoshiSeesaaRow,
  type OfficialDcdCard,
} from "./parse/catalogues";
import { mergeSurugaHtmlIntoListingsTsv } from "./pipeline/surugaPaste";
import {
  NARUTO_DATA_CARDDASS_PACK_ID,
  narutoDataCarddassCuratedDir,
} from "./pack";
import {
  formatDataCarddassReference,
  isDataCarddassSetCode,
  parseDataCarddassPrinted,
} from "./printKey";

// ─── Chitoroshop Shopify crawl ─────────────────────────────────────────────

const COLLECTION =
  "https://chitoroshop.com/collections/naruto-tcg-cartes-a-lunite-japonaises-naruto/products.json?limit=250";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const SURUGA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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

// ─── nao-yoshi Seesaa ───────────────────────────────────────────────────────

const LEDGER_FILE = "nao-yoshi-seesaa.json";

export type NaoYoshiSeesaaLedger = {
  source: string;
  sourceId: string;
  origin: string;
  harvestedAt: string;
  articles: Array<{
    id: string;
    cabinet: string;
    label: string;
    url: string;
    rows: number;
  }>;
  rows: NaoYoshiSeesaaRow[];
};

export function naoYoshiSeesaaLedgerPath(): string {
  return path.join(narutoDataCarddassCuratedDir(), "sources", LEDGER_FILE);
}

export function readNaoYoshiSeesaaLedger(): NaoYoshiSeesaaLedger | null {
  const p = naoYoshiSeesaaLedgerPath();
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as NaoYoshiSeesaaLedger;
}

async function fetchArticleBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    if (!res.data || res.data.byteLength < 400) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export async function harvestNaoYoshiSeesaa(opts: {
  force?: boolean;
  stagingDir?: string;
} = {}): Promise<NaoYoshiSeesaaLedger> {
  const staging =
    opts.stagingDir ??
    path.join(packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID), "nao-yoshi-seesaa");
  mkdirSync(staging, { recursive: true });

  const allRows: NaoYoshiSeesaaRow[] = [];
  const articleMeta: NaoYoshiSeesaaLedger["articles"] = [];

  for (const article of NAO_YOSHI_SEESAA_ARTICLES) {
    const url = `${NAO_YOSHI_SEESAA_ORIGIN}${article.path}`;
    const cachePath = path.join(staging, `${article.id}.html`);
    let buf: Buffer | null = null;
    if (!opts.force && existsSync(cachePath)) {
      buf = readFileSync(cachePath);
    }
    if (!buf || buf.byteLength < 400) {
      buf = await fetchArticleBytes(url);
      if (!buf) {
        console.warn(`── nao-yoshi — échec fetch ${article.id}`);
        continue;
      }
      writeFileSync(cachePath, buf);
    }
    const rows = parseNaoYoshiSeesaaBytes(buf, {
      articleId: article.id,
      cabinet: article.cabinet,
    });
    allRows.push(...rows);
    articleMeta.push({
      id: article.id,
      cabinet: article.cabinet,
      label: article.label,
      url,
      rows: rows.length,
    });
    console.log(
      `── nao-yoshi ${article.cabinet} — ${article.id} : ${rows.length} ligne(s)`,
    );
  }

  const merged = mergeNaoYoshiSeesaaRows(allRows);
  const ledger: NaoYoshiSeesaaLedger = {
    source: "nao-yoshi.seesaa.net",
    sourceId: "nao-yoshi-seesaa",
    origin: NAO_YOSHI_SEESAA_ORIGIN,
    harvestedAt: new Date().toISOString(),
    articles: articleMeta,
    rows: [...merged.values()].sort((a, b) =>
      a.printed.localeCompare(b.printed),
    ),
  };
  writeFileSync(
    naoYoshiSeesaaLedgerPath(),
    JSON.stringify(ledger, null, 2) + "\n",
    "utf8",
  );
  return ledger;
}

export type NaoYoshiApplyReport = {
  total: number;
  nameFixed: number;
  raritySet: number;
  unmatched: number;
  unchanged: number;
};

function shouldReplaceName(
  card: DataCarddassChecklistCard,
  next: string,
): boolean {
  const current = (card.nameJa ?? card.name ?? "").trim();
  if (!next.trim()) return false;
  if (!current) return true;
  if (current === card.printed) return true;
  if (looksLikeMojibakeJa(current)) return true;
  return false;
}

/**
 * Overlay Seesaa names + rarities onto the checklist JSON (in place).
 */
export function applyNaoYoshiSeesaaToChecklist(
  opts: {
    ledger?: NaoYoshiSeesaaLedger | null;
    dryRun?: boolean;
  } = {},
): NaoYoshiApplyReport {
  const ledger = opts.ledger ?? readNaoYoshiSeesaaLedger();
  if (!ledger) {
    return {
      total: 0,
      nameFixed: 0,
      raritySet: 0,
      unmatched: 0,
      unchanged: 0,
    };
  }
  const byPrinted = mergeNaoYoshiSeesaaRows(ledger.rows);
  const checklist = readDataCarddassChecklist();
  let nameFixed = 0;
  let raritySet = 0;
  let unmatched = 0;
  let unchanged = 0;

  const nextCards: DataCarddassChecklistCard[] = checklist.cards.map((card) => {
    const hit = byPrinted.get(card.printed.toUpperCase());
    if (!hit) {
      unmatched += 1;
      return card;
    }
    const updated: DataCarddassChecklistCard = { ...card };
    let changed = false;
    if (shouldReplaceName(card, hit.nameJa)) {
      updated.nameJa = hit.nameJa;
      updated.name = hit.nameJa;
      nameFixed += 1;
      changed = true;
    }
    if (hit.rarity) {
      if (updated.rarity !== hit.rarity) {
        updated.rarity = hit.rarity;
        raritySet += 1;
        changed = true;
      }
    }
    if (hit.barcodeData) {
      updated.barcodeData = hit.barcodeData;
    }
    if (!changed) unchanged += 1;
    return updated;
  });

  const report: NaoYoshiApplyReport = {
    total: checklist.cards.length,
    nameFixed,
    raritySet,
    unmatched,
    unchanged,
  };
  if (opts.dryRun) return report;

  const out = {
    ...checklist,
    cards: nextCards,
    naoYoshiAppliedAt: new Date().toISOString(),
    naoYoshiSource: ledger.source,
  };
  writeFileSync(
    dataCarddassChecklistPath(),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
  return report;
}

// ─── Official checklist assembly ────────────────────────────────────────────

export type OfficialChecklistAssembly = {
  cards: DataCarddassChecklistCard[];
  byPrefix: Record<string, number>;
  sources: string[];
};

function officialRoot(root?: string): string {
  return path.join(
    root ?? packStagingDir(NARUTO_DATA_CARDDASS_PACK_ID),
    "official",
  );
}

function readOfficialText(filePath: string): string {
  return decodeOfficialCardlistBytes(readFileSync(filePath));
}

function toChecklistCard(
  card: OfficialDcdCard,
  note?: string,
): DataCarddassChecklistCard | null {
  const parsed = parseDataCarddassPrinted(card.printed);
  if (!parsed || !isDataCarddassSetCode(parsed.set)) return null;
  const nameJa = card.nameJa.trim();
  // Wayback corruption (ex. NFP-004 → `?????`) — keep the slot with the printed ref.
  const safeName = !nameJa || /^\?+$/.test(nameJa) ? parsed.printed : nameJa;
  return {
    printed: parsed.printed,
    set: parsed.set,
    number: parsed.number,
    name: safeName,
    nameJa: safeName,
    note,
  };
}

function mergeCard(
  into: Map<string, DataCarddassChecklistCard>,
  card: DataCarddassChecklistCard,
): void {
  const prev = into.get(card.printed);
  if (!prev) {
    into.set(card.printed, card);
    return;
  }
  // Prefer Japanese name when previous was a Latin listing title.
  const prevJa = (prev.nameJa ?? prev.name).trim();
  const nextJa = (card.nameJa ?? card.name).trim();
  const prevLooksLatin = /^[\x00-\x7F]+$/.test(prevJa);
  const nextLooksJa = /[^\x00-\x7F]/.test(nextJa);
  if (prevLooksLatin && nextLooksJa) {
    into.set(card.printed, { ...prev, ...card, name: nextJa, nameJa: nextJa });
  }
}

export function assembleOfficialDataCarddassChecklist(opts?: {
  stagingRoot?: string;
  ebaySeed?: ReadonlyArray<{
    printed: string;
    name?: string;
    nameJa?: string | null;
    note?: string;
  }>;
}): OfficialChecklistAssembly {
  const root = officialRoot(opts?.stagingRoot);
  const byPrinted = new Map<string, DataCarddassChecklistCard>();
  const sources: string[] = [];

  const dnCsv = path.join(root, "dn", "battle_card.csv");
  if (existsSync(dnCsv)) {
    sources.push("dn/battle_card.csv");
    for (const row of parseBattleCardCsv(readOfficialText(dnCsv))) {
      const card = toChecklistCard(row, "carddass.com battle_card.csv");
      if (card) mergeCard(byPrinted, card);
    }
  }

  const nmDir = path.join(root, "nm");
  if (existsSync(nmDir)) {
    for (const name of readdirSync(nmDir).sort()) {
      if (!/\.(shtml|php|html)$/i.test(name)) continue;
      sources.push(`nm/${name}`);
      const html = readOfficialText(path.join(nmDir, name));
      for (const row of parseMissionCardlistHtml(html)) {
        const card = toChecklistCard(row, `carddass.com mission/${name}`);
        if (card) mergeCard(byPrinted, card);
      }
    }
  }

  const nfDir = path.join(root, "nf");
  if (existsSync(nfDir)) {
    for (const name of readdirSync(nfDir).sort()) {
      if (!/\.(php|html)$/i.test(name)) continue;
      sources.push(`nf/${name}`);
      const html = readOfficialText(path.join(nfDir, name));
      for (const row of parseFormationCardlistHtml(html)) {
        const card = toChecklistCard(row, `fudanin formation/${name}`);
        if (card) mergeCard(byPrinted, card);
      }
    }
  }

  const nxDir = path.join(root, "nx");
  if (existsSync(nxDir)) {
    for (const name of readdirSync(nxDir).sort()) {
      if (!/\.(php|html)$/i.test(name)) continue;
      sources.push(`nx/${name}`);
      const html = readOfficialText(path.join(nxDir, name));
      for (const row of parseCrossCardlistHtml(html)) {
        const card = toChecklistCard(row, `fudanin cross/${name}`);
        if (card) mergeCard(byPrinted, card);
      }
    }
  }

  const hinokunianPath = path.join(root, "hinokunian", "dn-dt.json");
  if (existsSync(hinokunianPath)) {
    sources.push("hinokunian/dn-dt.json");
    const payload = JSON.parse(readFileSync(hinokunianPath, "utf8")) as {
      cards?: Array<{ printed: string; nameJa: string }>;
    };
    for (const row of payload.cards ?? []) {
      const printed = normalizeOfficialPrinted(row.printed);
      if (!printed) continue;
      const card = toChecklistCard(
        { printed, nameJa: row.nameJa },
        "hinokunian cardbattle",
      );
      if (card) mergeCard(byPrinted, card);
    }
  }

  for (const seed of opts?.ebaySeed ?? []) {
    const printed = normalizeOfficialPrinted(seed.printed);
    if (!printed) continue;
    const nameJa = (seed.nameJa ?? seed.name ?? printed).trim();
    const card = toChecklistCard(
      { printed, nameJa },
      seed.note ?? "ebay seed",
    );
    if (card) mergeCard(byPrinted, card);
  }

  const surugaScanGl411Path = path.join(
    narutoDataCarddassCuratedDir(),
    "sources",
    "suruga-scan-gl411.json",
  );
  if (existsSync(surugaScanGl411Path)) {
    sources.push("suruga-scan-gl411.json");
    try {
      const scan = JSON.parse(readFileSync(surugaScanGl411Path, "utf8")) as Array<{
        id: string;
        h1: string;
        isNaruto: boolean;
        status: number;
      }>;
      for (const item of scan) {
        if (!item.isNaruto || item.status !== 200) continue;
        const printed = parseSurugaDataCarddassPrintedFromTitle(item.h1);
        if (!printed) continue;
        const parsed = parseDataCarddassPrinted(printed);
        if (!parsed) continue;
        const colonIdx = item.h1.lastIndexOf("：") !== -1 ? item.h1.lastIndexOf("：") : item.h1.lastIndexOf(":");
        const nameJa = colonIdx !== -1 ? item.h1.slice(colonIdx + 1).trim() : printed;
        const card: DataCarddassChecklistCard = {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          name: nameJa,
          nameJa,
          note: `suruga-ya ${item.id}`,
        };
        mergeCard(byPrinted, card);
      }
    } catch {
      /* ignore */
    }
  }

  const cards = [...byPrinted.values()].sort((a, b) =>
    a.printed.localeCompare(b.printed, "en"),
  );
  const byPrefix: Record<string, number> = {};
  for (const card of cards) {
    const pref = card.printed.split("-")[0] ?? "?";
    byPrefix[pref] = (byPrefix[pref] ?? 0) + 1;
  }
  return { cards, byPrefix, sources };
}

export function writeOfficialDataCarddassChecklist(opts?: {
  stagingRoot?: string;
  outPath?: string;
  ebaySeedPath?: string;
}): OfficialChecklistAssembly & { outPath: string } {
  let ebaySeed: OfficialChecklistAssembly["cards"] = [];
  const ebayPath =
    opts?.ebaySeedPath ??
    path.join(
      narutoDataCarddassCuratedDir(),
      "sources",
      "ebay.json",
    );
  if (existsSync(ebayPath)) {
    const ebay = JSON.parse(readFileSync(ebayPath, "utf8")) as {
      faces?: Array<{ printedRef: string; title?: string }>;
    };
    ebaySeed = (ebay.faces ?? [])
      .map((face): DataCarddassChecklistCard | null => {
        const printed = normalizeOfficialPrinted(face.printedRef);
        if (!printed) return null;
        const parsed = parseDataCarddassPrinted(printed);
        if (!parsed) return null;
        return {
          printed: parsed.printed,
          set: parsed.set,
          number: parsed.number,
          name: face.title ?? printed,
          nameJa: null,
          note: "ebay mikanshop seed",
        } satisfies DataCarddassChecklistCard;
      })
      .filter((row): row is DataCarddassChecklistCard => row != null);
  }

  const assembled = assembleOfficialDataCarddassChecklist({
    stagingRoot: opts?.stagingRoot,
    ebaySeed,
  });
  const outPath =
    opts?.outPath ??
    path.join(
      narutoDataCarddassCuratedDir(),
      "sources",
      "data-carddass-checklist.json",
    );
  const payload = {
    source:
      "carddass.com mission (miroir) + fudanin formation/cross (Wayback) + hinokunian DN/DT + ebay seed",
    observed: new Date().toISOString().slice(0, 10),
    url: "http://www.carddass.com/naruto/mission/cardlist/battle_card.shtml",
    line: "data-carddass",
    note:
      "Catalogue officiel assemblé 2026-09-09. NX hors chapitre 1 encore partiel (Wayback popups). SKU scellés retail non attestés.",
    cabinets: [
      { code: "dn", titleJa: "ナルティメットカードバトル", prefix: "DN" },
      { code: "dt", titleJa: "ナルティメットカードバトル（第4弾）", prefix: "DT" },
      { code: "nm", titleJa: "ナルティメットミッション", prefix: "NM" },
      { code: "nc", titleJa: "疾風クリアカード", prefix: "NC" },
      { code: "nf", titleJa: "ナルティメットフォーメーション", prefix: "NF" },
      { code: "nfc", titleJa: "疾風クリアカード2", prefix: "NFC" },
      { code: "nff", titleJa: "フォーメーションファイル", prefix: "NFF" },
      { code: "nx", titleJa: "ナルティメットクロス", prefix: "NX" },
      { code: "nxp", titleJa: "クロスプロモ", prefix: "NXP" },
      { code: "nxpf", titleJa: "クロス特別", prefix: "NXPF" },
      { code: "nxmac", titleJa: "クロスマクドナルドプロモ", prefix: "NX-MAC" },
      { code: "nxcam", titleJa: "クロスデザインレア", prefix: "NX-CAM" },
      { code: "nxsp", titleJa: "クロスSP", prefix: "NX-SP" },
      { code: "nxpsp", titleJa: "クロスプロモSP", prefix: "NXP-SP" },
      { code: "can", titleJa: "CANプロモ", prefix: "CAN" },
      { code: "nfm", titleJa: "フォーメーション特別", prefix: "NFM" },
      { code: "nfp", titleJa: "フォーメーションプロモ", prefix: "NFP" },
      { code: "dnp", titleJa: "DNプロモ", prefix: "DNP" },
      { code: "dmp", titleJa: "ミッションプロモ", prefix: "DMP" },
    ],
    byPrefix: assembled.byPrefix,
    sources: assembled.sources,
    cards: assembled.cards,
    not: [
      "carddass",
      "en-ccg",
      "ni",
      "te",
      "ta",
      "n",
      "j",
      "m",
      "ultimate-ninja-mission-physical",
    ],
  };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { ...assembled, outPath };
}

// ─── Suruga live harvest ────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** JP category — same shelf as `SURUGA_DCD_CATEGORY` (EN). Cloudflare → Flare. */
const SURUGA_DCD_JP_CATEGORY =
  "https://www.suruga-ya.jp/search?category=501080113";

async function fetchSurugaHtml(url: string): Promise<string> {
  const html = await fetchTextWithFlareFallback(url, {
    headers: {
      "User-Agent": SURUGA_UA,
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      Accept: "text/html,*/*",
      Referer: "https://www.suruga-ya.jp/",
    },
    timeout: 25_000,
    flareMaxTimeoutMs: 60_000,
  });
  return html ?? "";
}

async function harvestSurugaDcdPages(
  label: string,
  urlForPage: (page: number) => string,
  maxPages: number,
): Promise<number> {
  let added = 0;
  for (let page = 1; page <= maxPages; page++) {
    const url = urlForPage(page);
    try {
      console.log(`[suruga-dcd] ${label} page ${page}...`);
      const html = await fetchSurugaHtml(url);
      if (!html || html.includes("Just a moment...")) {
        console.warn(
          `[suruga-dcd] Cloudflare challenge on ${label} page ${page}, stopping.`,
        );
        break;
      }
      const resMerge = mergeSurugaHtmlIntoListingsTsv(html);
      added += resMerge.added;
      console.log(
        `[suruga-dcd] ${label} page ${page}: listings ${resMerge.after} (+${resMerge.added})`,
      );
      const hasNext =
        html.includes(`page=${page + 1}`) ||
        html.includes(`page=${page + 1}&`) ||
        /rel=["']next["']/i.test(html);
      // Deux pages sans nouveau SKU → le rayon est déjà dans le TSV.
      if (resMerge.added === 0 && page > 1) {
        console.log(`[suruga-dcd] No new listings on ${label} page ${page}, stop.`);
        break;
      }
      if (!hasNext) {
        console.log(`[suruga-dcd] No next page for ${label}.`);
        break;
      }
      await sleep(400);
    } catch (err: unknown) {
      console.error(
        `[suruga-dcd] Error on ${label} page ${page}:`,
        err instanceof Error ? err.message : err,
      );
      break;
    }
  }
  return added;
}

export async function harvestSurugaDcd(
  queries: string[] = [
    "NARUTO フォーメーション",
    "NARUTO ナルティメットクロス",
    "NARUTO DT-",
    "NARUTO 疾風伝 カードダス",
    "NARUTO ナルティメット",
  ],
  maxPagesPerQuery = 26,
): Promise<void> {
  let grandTotalAdded = 0;

  // Bare category first (user shelf) — covers whatever search_word would miss.
  console.log(`\n=== Harvesting Suruga DCD category 501080113 ===`);
  grandTotalAdded += await harvestSurugaDcdPages(
    "category",
    (page) =>
      page <= 1
        ? SURUGA_DCD_JP_CATEGORY
        : `${SURUGA_DCD_JP_CATEGORY}&page=${page}`,
    maxPagesPerQuery,
  );

  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    console.log(`\n=== Harvesting query: "${q}" ===`);
    const queryAdded = await harvestSurugaDcdPages(
      `"${q}"`,
      (page) =>
        `${SURUGA_DCD_JP_CATEGORY}&search_word=${encoded}&page=${page}`,
      maxPagesPerQuery,
    );
    grandTotalAdded += queryAdded;
    console.log(`[suruga-dcd] Query "${q}" finished: added ${queryAdded}.`);
  }

  console.log(`\n[suruga-dcd] Grand total new listings added: ${grandTotalAdded}`);
}

const isDirectCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCli) {
  harvestSurugaDcd();
}
