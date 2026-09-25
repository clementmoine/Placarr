/**
 * Harvest JA Dragon Ball Card Game singles from Chitoroshop Shopify collection
 * → curated ledger (`sources/chitoroshop.json`).
 *
 * Collection: cartes-dragon-ball-card-game-2003-2004 (~261 products, ~249 D-/SP-).
 * Faces are Japanese card photos; product titles are English.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { dbsJccCuratedDir } from "../pack";
import { parseDbsjccNumber } from "../printKey";

const COLLECTION =
  "https://chitoroshop.com/collections/cartes-dragon-ball-card-game-2003-2004/products.json?limit=250";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Printed ref in Shopify title / handle (`D-205`, `SP-7`). */
const PRINTED_RE = /\b((?:SP|D)\s*[-_]?\s*\d+)\b/i;

export type ShopifyProduct = {
  handle: string;
  title: string;
  body_html?: string | null;
  images?: { src: string; position?: number }[];
};

export type ChitoroshopFaceRow = {
  printed: string;
  number: string;
  /** `partN` / `promo` / `sp` when attested in title or body; else null. */
  setHint: string | null;
  handle: string;
  productUrl: string;
  url: string;
  title: string;
  /** English product name with collector number stripped, when parseable. */
  titleEn: string | null;
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

/** Candidate print row for set disambiguation (FR corpus has ~400 shared D- numbers). */
export type DbsjccPrintCandidate = {
  printKey: string;
  setCode: string;
  number: string;
  grouping: string | null;
};

export type ChitoroshopMatchResult =
  | { kind: "match"; print: DbsjccPrintCandidate }
  | { kind: "mint"; setCode: string }
  | { kind: "skip"; reason: string };

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
      const nested = u.pathname.match(
        /\/cdn\/shop\/files\/(?:\d+\/)+\d+\/files\/(.+)$/i,
      );
      if (nested) {
        return `https://chitoroshop.com/cdn/shop/files/${nested[1]!}`;
      }
      return bare;
    }
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
): { printed: string; number: string } | null {
  const handle = product.handle ?? "";
  const title = product.title ?? "";
  const m = title.match(PRINTED_RE) || handle.match(PRINTED_RE);
  if (!m) return null;
  const number = parseDbsjccNumber(m[1]!);
  if (!number) return null;
  const prefix = number.startsWith("sp") ? "SP" : "D";
  const n = Number.parseInt(number.replace(/^[a-z]+/, ""), 10);
  return { printed: `${prefix}-${n}`, number };
}

/**
 * Set hint from title / body_html.
 * SP collector numbers always map to `sp` (even when the listing says Promo).
 * `series N` and `Part N` both mean retail part N for this Card Game line.
 */
export function extractSetHintFromChitoroshopProduct(
  product: Pick<ShopifyProduct, "title" | "body_html" | "handle">,
  printedNumber: string,
): string | null {
  if (printedNumber.startsWith("sp")) return "sp";
  const text = [
    product.title ?? "",
    product.body_html ?? "",
    product.handle ?? "",
  ].join("\n");

  const part = text.match(
    /(?:\(|\b)(?:part|series)\s*(\d{1,2})\b/i,
  );
  if (part) {
    const n = Number.parseInt(part[1]!, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 10) return `part${n}`;
  }

  if (
    /\b(?:filing\s*sheet\s*)?promo(?:tion(?:al)?)?\b/i.test(text) ||
    /\bhors[- ]?s[eé]rie\b/i.test(text)
  ) {
    return "promo";
  }
  return null;
}

/** Strip collector number / pipe / part parenthetical from Shopify EN title. */
export function extractEnTitleFromChitoroshopProduct(
  product: Pick<ShopifyProduct, "title">,
): string | null {
  let t = (product.title ?? "").trim();
  if (!t) return null;
  t = t.replace(/\s*\|\s*Dragon Ball Card Game.*$/i, "");
  t = t.replace(/\s*\((?:Part|Series)\s*\d+\)\s*$/i, "");
  t = t.replace(/\s*\((?:Promo|Gold Rare[^)]*|Glossy[^)]*)\)\s*$/i, "");
  t = t.replace(/\s+(?:SP|D)\s*[-_]?\s*\d+\s*$/i, "");
  t = t.replace(/\s+/g, " ").trim();
  return t || null;
}

function partRank(setCode: string): number {
  const m = setCode.trim().toLowerCase().match(/^part(\d+)$/);
  if (m) return Number.parseInt(m[1]!, 10);
  if (setCode === "promo") return 100;
  if (setCode === "sp") return 101;
  return 200;
}

function preferUngrouped(
  rows: readonly DbsjccPrintCandidate[],
): DbsjccPrintCandidate | null {
  if (rows.length === 0) return null;
  const plain = rows.filter((r) => !r.grouping);
  if (plain.length === 1) return plain[0]!;
  if (plain.length > 1) return null;
  return rows.length === 1 ? rows[0]! : null;
}

/**
 * Resolve a Chitoroshop single onto the FR JCC corpus.
 *
 * - With `setHint`: match that set only; else mint JA-only for the hint.
 * - Without hint: prefer lowest `partN` over `promo`/`sp`; skip if still
 *   ambiguous (multiple ungrouped prints at the preferred rank).
 */
export function matchChitoroshopToDbsjccPrint(
  number: string,
  setHint: string | null,
  candidates: readonly DbsjccPrintCandidate[],
): ChitoroshopMatchResult {
  const hits = candidates.filter((c) => c.number === number);
  const byKey = new Map<string, DbsjccPrintCandidate>();
  for (const hit of hits) {
    if (!byKey.has(hit.printKey)) byKey.set(hit.printKey, hit);
  }
  const unique = [...byKey.values()];

  if (setHint) {
    const inSet = unique.filter((c) => c.setCode === setHint);
    if (inSet.length === 0) {
      return { kind: "mint", setCode: setHint };
    }
    const picked = preferUngrouped(inSet);
    if (!picked) {
      return {
        kind: "skip",
        reason: `ambiguous ${number} in ${setHint} (${inSet.length} prints)`,
      };
    }
    return { kind: "match", print: picked };
  }

  if (unique.length === 0) {
    return { kind: "skip", reason: `no FR print for ${number} and no set hint` };
  }

  let bestRank = Infinity;
  for (const c of unique) {
    bestRank = Math.min(bestRank, partRank(c.setCode));
  }
  const preferred = unique.filter((c) => partRank(c.setCode) === bestRank);
  const picked = preferUngrouped(preferred);
  if (!picked) {
    return {
      kind: "skip",
      reason: `ambiguous ${number} without set hint (${preferred.map((p) => p.printKey).join(",")})`,
    };
  }
  return { kind: "match", print: picked };
}

export function facesFromChitoroshopProducts(
  products: readonly ShopifyProduct[],
): ChitoroshopFaceRow[] {
  const faces: ChitoroshopFaceRow[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const parsed = extractPrintedFromChitoroshopProduct(product);
    if (!parsed) continue;
    const key = parsed.number;
    if (seen.has(key)) continue;
    const img = product.images?.[0]?.src;
    if (!img) continue;
    const url = normalizeChitoroshopImageUrl(img);
    if (!url) continue;
    seen.add(key);
    faces.push({
      printed: parsed.printed,
      number: parsed.number,
      setHint: extractSetHintFromChitoroshopProduct(product, parsed.number),
      handle: product.handle,
      productUrl: `https://chitoroshop.com/products/${product.handle}`,
      url,
      title: product.title,
      titleEn: extractEnTitleFromChitoroshopProduct(product),
      ingest: true,
    });
  }
  faces.sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true }),
  );
  return faces;
}

export async function fetchChitoroshopDbsjccProducts(): Promise<
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
      "chitoroshop.com — Dragon Ball Card Game 2003–2004 singles (Shopify products.json)",
    observed,
    ingest: "faces",
    crawl: false,
    note: "Boutique FR Shopify. Collection paginée limit=250. Photos JA, titres EN « Name D-205 | Dragon Ball Card Game ». body_html / title portent Part N · series N · Promo. D-numbers non uniques côté FR → setHint + match prudent à l'install.",
    listed: faces.length,
    faces,
  };
}

export function dbsJccChitoroshopLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "chitoroshop.json");
}

export function writeChitoroshopLedger(
  ledger: ChitoroshopLedger,
  outPath = dbsJccChitoroshopLedgerPath(),
): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return outPath;
}

export function readChitoroshopLedger(
  ledgerPath = dbsJccChitoroshopLedgerPath(),
): ChitoroshopLedger | null {
  if (!existsSync(ledgerPath)) return null;
  return JSON.parse(readFileSync(ledgerPath, "utf8")) as ChitoroshopLedger;
}

/** Live harvest → rewrite curated ledger. */
export async function harvestDbsJccChitoroshopFaces(): Promise<{
  products: number;
  faces: number;
  path: string;
}> {
  const products = await fetchChitoroshopDbsjccProducts();
  const ledger = buildChitoroshopLedger(products);
  const out = writeChitoroshopLedger(ledger);
  return { products: products.length, faces: ledger.faces.length, path: out };
}
