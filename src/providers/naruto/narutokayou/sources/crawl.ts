/**
 * Kayou catalogue crawls — official, narutodb, narutopia, external (CCG / alertehit).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { parseNarutopiaChecklistHtml } from "@/providers/naruto/shared/narutopia/parseChecklistPage";

import type { KayouChecklist } from "../identity";
import { narutoKayouCuratedDir } from "../pack";
import {
  ALERTEHIT_NARUTODEX_JS,
  buildAlertehitImageIndex,
  buildCapsulecorpChecklist,
  buildNarutodbKayouChecklist,
  buildNarutopiaKayouImageIndex,
  CAPSULECORPGEAR_LIST_URL,
  extractCapsulecorpCardsJson,
  KAYOU_NARUTO_IP_ID,
  KAYOU_OFFICIAL_IP_COLLECTIONS,
  KAYOU_OFFICIAL_SERIES_URL,
  NARUTOPIA_KAYOU_PAGE_URLS,
  narutodbSetCardsApiUrl,
  narutodbSetsApiUrl,
  parseKayouOfficialIpSeriesIndex,
  parseKayouOfficialSeriesDetail,
  parseKayouOfficialSeriesIds,
  parseNarutodbCardsJson,
  parseNarutodbSetsJson,
  type AlerteHitImageIndex,
  type KayouOfficialSeriesDetail,
  type NarutodbCardListRow,
  type NarutopiaKayouImageIndex,
} from "../parse/hosts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";


// ─── kayouOfficialCrawl ───

export const KAYOU_OFFICIAL_CATALOG_FILE = "kayou-official-catalog.json";

export type KayouOfficialCatalogSeries = KayouOfficialSeriesDetail & {
  sectionEyebrow: string;
  sectionTitle: string;
  url: string;
};

export type KayouOfficialCatalog = {
  source: string;
  ipId: string;
  observed: string;
  crawledAt: string;
  contentHash: string;
  previousHash: string | null;
  changed: boolean;
  series: KayouOfficialCatalogSeries[];
};

export type KayouOfficialCrawlReport = {
  series: number;
  cards: number;
  changed: boolean;
  contentHash: string;
  path: string;
};

export function kayouOfficialCatalogPath(): string {
  return path.join(narutoKayouCuratedDir(), "sources", KAYOU_OFFICIAL_CATALOG_FILE);
}

export function readKayouOfficialCatalog(): KayouOfficialCatalog | null {
  const manifestPath = kayouOfficialCatalogPath();
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as KayouOfficialCatalog;
  } catch {
    return null;
  }
}

/** Stable hash over series ids + card idCodes (detects additions / removals). */
export function hashKayouOfficialCatalog(
  series: readonly Pick<KayouOfficialCatalogSeries, "seriesId" | "cards">[],
): string {
  const lines: string[] = [];
  for (const row of [...series].sort((a, b) =>
    a.seriesId.localeCompare(b.seriesId),
  )) {
    lines.push(row.seriesId);
    for (const card of row.cards) {
      lines.push(`${card.idCode}|${card.rarity}|${card.backImage}|${card.frontImage}`);
    }
  }
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

async function fetchText(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: { "User-Agent": UA },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (status) => status === 200,
  });
  return res.data;
}

export async function crawlKayouOfficialNaruto(opts: {
  ipId?: string;
  onProgress?: (message: string) => void;
  delayMs?: number;
} = {}): Promise<KayouOfficialCatalog> {
  const report = opts.onProgress ?? ((m: string) => console.log(`   kayou crawl — ${m}`));
  const ipId = opts.ipId ?? KAYOU_NARUTO_IP_ID;
  const delayMs = opts.delayMs ?? 0;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  report(`index IP ${ipId}…`);
  const ipHtml = await fetchText(KAYOU_OFFICIAL_IP_COLLECTIONS);
  const index = parseKayouOfficialIpSeriesIndex(ipHtml, ipId);
  const indexBySeries = new Map(index.map((row) => [row.seriesId, row]));

  const seriesOut: KayouOfficialCatalogSeries[] = [];
  const seenSeries = new Set<string>();
  for (const entry of index) {
    if (seenSeries.has(entry.seriesId)) continue;
    seenSeries.add(entry.seriesId);
    if (delayMs > 0) await sleep(delayMs);
    report(`${entry.sectionTitle || entry.seriesId} (${entry.seriesId})…`);
    const html = await fetchText(KAYOU_OFFICIAL_SERIES_URL(entry.seriesId));
    const detail = parseKayouOfficialSeriesDetail(html, entry.seriesId);
    seriesOut.push({
      ...detail,
      sectionEyebrow: entry.sectionEyebrow,
      sectionTitle: entry.sectionTitle,
      url: KAYOU_OFFICIAL_SERIES_URL(entry.seriesId),
    });
  }

  // Series linked on IP page but missing from section walk (defensive).
  for (const seriesId of parseKayouOfficialSeriesIds(ipHtml, ipId)) {
    if (seenSeries.has(seriesId)) continue;
    seenSeries.add(seriesId);
    const meta = indexBySeries.get(seriesId);
    report(`série orpheline ${seriesId}…`);
    const html = await fetchText(KAYOU_OFFICIAL_SERIES_URL(seriesId));
    const detail = parseKayouOfficialSeriesDetail(html, seriesId);
    seriesOut.push({
      ...detail,
      sectionEyebrow: meta?.sectionEyebrow ?? "",
      sectionTitle: meta?.sectionTitle ?? "",
      url: KAYOU_OFFICIAL_SERIES_URL(seriesId),
    });
  }

  const contentHash = hashKayouOfficialCatalog(seriesOut);
  const previous = readKayouOfficialCatalog();
  const previousHash = previous?.contentHash ?? null;
  const now = new Date();

  return {
    source: "kayouofficial.com — Naruto IP catalogue crawl",
    ipId,
    observed: now.toISOString().slice(0, 10),
    crawledAt: now.toISOString(),
    contentHash,
    previousHash,
    changed: contentHash !== previousHash,
    series: seriesOut.sort((a, b) => a.seriesId.localeCompare(b.seriesId)),
  };
}

export async function writeKayouOfficialCatalog(
  catalog: KayouOfficialCatalog,
): Promise<KayouOfficialCrawlReport> {
  const manifestPath = kayouOfficialCatalogPath();
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const cards = catalog.series.reduce((n, row) => n + row.cards.length, 0);
  return {
    series: catalog.series.length,
    cards,
    changed: catalog.changed,
    contentHash: catalog.contentHash,
    path: manifestPath,
  };
}

/** IP index → each SKU page → manifest JSON (Catalogue Sync hook). */
export async function runKayouOfficialCatalogCrawl(
  opts: {
    onProgress?: (message: string) => void;
    delayMs?: number;
  } = {},
): Promise<KayouOfficialCrawlReport> {
  const catalog = await crawlKayouOfficialNaruto(opts);
  return writeKayouOfficialCatalog(catalog);
}

// ─── narutodbCrawl ───

export const NARUTODB_CHECKLIST_FILE = "narutodb-kayou-checklist.json";

export function narutodbChecklistPath(): string {
  return path.join(narutoKayouCuratedDir(), "sources", NARUTODB_CHECKLIST_FILE);
}

export function readNarutodbChecklist(): KayouChecklist | null {
  try {
    return JSON.parse(
      readFileSync(narutodbChecklistPath(), "utf8"),
    ) as KayouChecklist;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await httpGet(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    responseType: "json",
    timeout: 60_000,
  });
  return (res as { data?: unknown }).data;
}

export async function crawlNarutodbKayouChecklist(opts?: {
  onProgress?: (message: string) => void;
}): Promise<{
  checklist: KayouChecklist;
  sets: number;
  cards: number;
  changed: boolean;
}> {
  const report =
    opts?.onProgress ?? ((m: string) => console.log(`   narutodb — ${m}`));
  report("sets…");
  const sets = parseNarutodbSetsJson(await fetchJson(narutodbSetsApiUrl()));
  const cardsBySet: Record<string, NarutodbCardListRow[]> = {};
  let cards = 0;
  for (const set of sets) {
    report(`set ${set.id} (${set.name})…`);
    const rows = parseNarutodbCardsJson(
      await fetchJson(narutodbSetCardsApiUrl(set.id)),
    );
    cardsBySet[set.id] = rows;
    cards += rows.length;
  }
  const observed = new Date().toISOString().slice(0, 10);
  const checklist = buildNarutodbKayouChecklist({
    sets,
    cardsBySet,
    observed,
  });
  const dest = narutodbChecklistPath();
  mkdirSync(path.dirname(dest), { recursive: true });
  const next = `${JSON.stringify(checklist, null, 2)}\n`;
  let changed = true;
  if (existsSync(dest)) {
    changed = readFileSync(dest, "utf8") !== next;
  }
  if (changed) writeFileSync(dest, next);
  return {
    checklist,
    sets: checklist.sets.length,
    cards: checklist.sets.reduce((n, s) => n + s.cards.length, 0),
    changed,
  };
}

// ─── narutopiaCrawl ───

export const NARUTOPIA_KAYOU_INDEX_FILE = "narutopia-kayou-images.json";

export function narutopiaKayouImageIndexPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    NARUTOPIA_KAYOU_INDEX_FILE,
  );
}

export function readNarutopiaKayouImageIndex(): NarutopiaKayouImageIndex | null {
  try {
    return JSON.parse(
      readFileSync(narutopiaKayouImageIndexPath(), "utf8"),
    ) as NarutopiaKayouImageIndex;
  } catch {
    return null;
  }
}

export async function crawlNarutopiaKayouImageIndex(opts: {
  urls?: readonly string[];
  delayMs?: number;
} = {}): Promise<NarutopiaKayouImageIndex> {
  const urls = opts.urls ?? NARUTOPIA_KAYOU_PAGE_URLS;
  const delayMs = opts.delayMs ?? 120;
  const pages: { url: string; entries: ReturnType<typeof parseNarutopiaChecklistHtml> }[] =
    [];
  for (const url of urls) {
    try {
      const res = await httpGet<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeout: 90_000,
      });
      pages.push({
        url,
        entries: parseNarutopiaChecklistHtml(String(res.data)),
      });
    } catch {
      pages.push({ url, entries: [] });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return buildNarutopiaKayouImageIndex(pages);
}

export async function runNarutopiaKayouCrawl(): Promise<{
  images: number;
  pages: number;
  changed: boolean;
}> {
  const pathOut = narutopiaKayouImageIndexPath();
  const prev = readNarutopiaKayouImageIndex();
  const next = await crawlNarutopiaKayouImageIndex();
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) {
    mkdirSync(path.dirname(pathOut), { recursive: true });
    writeFileSync(pathOut, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  return {
    images: next.images.length,
    pages: next.pages.length,
    changed,
  };
}

// ─── kayouExternalCrawl ───

export const CAPSULECORPGEAR_CHECKLIST_FILE = "capsulecorpgear-kayou-checklist.json";
export const ALERTEHIT_IMAGE_INDEX_FILE = "alertehit-narutodex-images.json";

export function capsulecorpgearChecklistPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    CAPSULECORPGEAR_CHECKLIST_FILE,
  );
}

export function alertehitImageIndexPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    ALERTEHIT_IMAGE_INDEX_FILE,
  );
}

export function readCapsulecorpgearChecklist(): KayouChecklist | null {
  try {
    return JSON.parse(
      readFileSync(capsulecorpgearChecklistPath(), "utf8"),
    ) as KayouChecklist;
  } catch {
    return null;
  }
}

export function readAlertehitImageIndex(): AlerteHitImageIndex | null {
  try {
    return JSON.parse(
      readFileSync(alertehitImageIndexPath(), "utf8"),
    ) as AlerteHitImageIndex;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export type KayouExternalCrawlReport = {
  capsulecorp: { sets: number; cards: number; changed: boolean };
  alertehit: { images: number; changed: boolean };
  narutopia: { images: number; pages: number; changed: boolean };
};

export async function crawlCapsulecorpgearChecklist(): Promise<KayouChecklist> {
  const res = await httpGet<string>(CAPSULECORPGEAR_LIST_URL, {
    headers: { "User-Agent": UA },
    timeout: 60_000,
  });
  const raw = extractCapsulecorpCardsJson(res.data);
  return buildCapsulecorpChecklist(raw);
}

export async function crawlAlertehitImageIndex(): Promise<AlerteHitImageIndex> {
  const res = await httpGet<string>(ALERTEHIT_NARUTODEX_JS, {
    headers: { "User-Agent": UA, Referer: "https://alertehit.fr/narutodex" },
    timeout: 60_000,
  });
  return buildAlertehitImageIndex(res.data);
}

export async function runKayouExternalCatalogCrawl(): Promise<KayouExternalCrawlReport> {
  const capsulePath = capsulecorpgearChecklistPath();
  const alertePath = alertehitImageIndexPath();
  const prevCapsule = readCapsulecorpgearChecklist();
  const prevAlerte = readAlertehitImageIndex();

  const capsule = await crawlCapsulecorpgearChecklist();
  const alerte = await crawlAlertehitImageIndex();

  const capsuleJson = JSON.stringify(capsule);
  const alerteJson = JSON.stringify(alerte);
  const capsuleChanged = JSON.stringify(prevCapsule) !== capsuleJson;
  const alerteChanged = JSON.stringify(prevAlerte) !== alerteJson;

  if (capsuleChanged) writeJson(capsulePath, capsule);
  if (alerteChanged) writeJson(alertePath, alerte);

  let narutopia = { images: 0, pages: 0, changed: false };
  try {
    narutopia = await runNarutopiaKayouCrawl();
  } catch {
    narutopia = { images: 0, pages: 0, changed: false };
  }

  return {
    capsulecorp: {
      sets: capsule.sets.length,
      cards: capsule.sets.reduce((n, s) => n + s.cards.length, 0),
      changed: capsuleChanged,
    },
    alertehit: {
      images: alerte.images.length,
      changed: alerteChanged,
    },
    narutopia,
  };
}
