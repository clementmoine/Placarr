import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import { Readable } from "node:stream";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import { cleanCode, detectPlatformKey } from "@/lib/barcode/query";
import {
  ensureICollectIndex,
  lookupICollectItemUrlByBarcodeKey,
  readCachedICollectMetadata,
  rememberICollectBarcodeMapping,
  writeCachedICollectMetadata,
} from "./indexStore";
import { icollectCoverRegionFromAgeRating } from "./imageLabels";

const ICE_BASE = "https://www.icollecteverything.com";
const ICE_SITEMAP_MASTER = `${ICE_BASE}/sitemaps/sitemap-master.xml`;
const ICE_VIDEOGAME_SITEMAP_PREFIX = "sitemap-videogames";

export const ICE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  Cookie: "ice_human=1",
};

const ICE_TIMEOUT_MS = 20_000;
const SITEMAP_STREAM_TIMEOUT_MS = 45_000;
const SITEMAP_SCAN_OVERLAP = 256;

export interface ICollectMetadata {
  itemId: string;
  itemUrl: string;
  title: string;
  barcode?: string | null;
  platform?: string | null;
  publisher?: string | null;
  developer?: string | null;
  description?: string | null;
  releaseDate?: string | null;
  coverUrl?: string | null;
  images: Array<{ url: string; label?: string }>;
  players?: string | null;
  ageRating?: string | null;
  estimatedValueCents?: number | null;
  estimatedValueDate?: string | null;
  series?: string | null;
  ignScore?: string | null;
  genres?: string[];
  countryOfPurchase?: string | null;
}

export function barcodeMatchKey(value?: string | null): string {
  return cleanCode(value).replace(/^0+/, "");
}

export function barcodesEquivalent(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = barcodeMatchKey(left);
  const b = barcodeMatchKey(right);
  return Boolean(a && b && a === b);
}

export function barcodeSearchNeedles(barcode: string): string[] {
  const cleaned = cleanCode(barcode);
  if (!cleaned) return [];

  const stripped = cleaned.replace(/^0+/, "");
  const needles = new Set<string>([cleaned, stripped]);

  if (stripped.length === 12) needles.add(`0${stripped}`);
  if (cleaned.length === 13 && cleaned.startsWith("0")) {
    needles.add(cleaned.slice(1));
  }

  return [...needles].filter(Boolean).sort((a, b) => b.length - a.length);
}

function cleanText(value?: string | null): string | undefined {
  const text = decodeHTMLEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function parseJsonLdBlocks(html: string): any[] {
  const blocks: any[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeHTMLEntities(match[1].trim()));
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed["@graph"])) blocks.push(...parsed["@graph"]);
        else blocks.push(parsed);
      }
    } catch {
      // Ignore malformed schema snippets.
    }
  }
  return blocks;
}

function schemaTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

function readAdditionalProperty(
  properties: unknown,
  name: string,
): string | undefined {
  if (!Array.isArray(properties)) return undefined;
  for (const entry of properties) {
    if (!entry || typeof entry !== "object") continue;
    if (String((entry as { name?: string }).name || "") !== name) continue;
    const value = (entry as { value?: unknown }).value;
    if (value == null) continue;
    return cleanText(String(value));
  }
  return undefined;
}

export function parseEstimatedValueCents(raw?: string | null): number | null {
  const text = cleanText(raw);
  if (!text) return null;

  if (text.includes("€")) {
    const euro = text.match(/~?\s*€\s*([\d.,]+)/);
    if (euro) {
      const normalized = euro[1].replace(",", ".");
      const amount = Number.parseFloat(normalized);
      if (Number.isFinite(amount) && amount > 0) {
        return Math.round(amount * 100);
      }
    }
  }

  const direct = text.match(/(?:en_[A-Z]{2}\s+)?(\d{2,6})(?:\s|$)/i);
  if (direct) {
    const cents = Number.parseInt(direct[1], 10);
    return Number.isFinite(cents) && cents > 0 ? cents : null;
  }

  return null;
}

export function extractItemUrlFromSitemapContext(
  xml: string,
  markerIndex: number,
): string | null {
  const chunk = xml.slice(Math.max(0, markerIndex - 1_200), markerIndex + 200);
  const locMatches = [
    ...chunk.matchAll(
      /<loc>(https:\/\/www\.icollecteverything\.com\/db\/item\/videogame\/(\d+)\/)<\/loc>/gi,
    ),
  ];
  if (locMatches.length > 0) {
    return locMatches[locMatches.length - 1][1];
  }

  const imageMatch = chunk.match(
    /\/images\/videogame\/main\/\d+\/(\d+)_\d+\.jpg/i,
  );
  if (imageMatch?.[1]) {
    return `${ICE_BASE}/db/item/videogame/${imageMatch[1]}/`;
  }

  return null;
}

export function findVideoGameItemUrlInSitemapXml(
  xml: string,
  barcode: string,
): string | null {
  for (const needle of barcodeSearchNeedles(barcode)) {
    const marker = `[Barcode ${needle}]`;
    let fromIndex = 0;
    while (fromIndex >= 0) {
      const markerIndex = xml.indexOf(marker, fromIndex);
      if (markerIndex < 0) break;
      const itemUrl = extractItemUrlFromSitemapContext(xml, markerIndex);
      if (itemUrl) return itemUrl;
      fromIndex = markerIndex + marker.length;
    }
  }
  return null;
}

export function parseVideoGameSitemapUrls(masterXml: string): string[] {
  return [
    ...masterXml.matchAll(
      new RegExp(
        `<loc>(https://www\\.icollecteverything\\.com/sitemaps/${ICE_VIDEOGAME_SITEMAP_PREFIX}\\d+\\.xml)</loc>`,
        "gi",
      ),
    ),
  ].map((match) => match[1]);
}

function parseMainImages(html: string): Array<{ url: string; label?: string }> {
  const images: Array<{ url: string; label?: string }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(
    /<img[^>]+class=["']mainimages["'][^>]*>/gi,
  )) {
    const tag = match[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const alt = cleanText(tag.match(/\balt=["']([^"']*)["']/i)?.[1]);
    images.push({ url: src, ...(alt ? { label: alt } : {}) });
  }
  return images;
}

function parseHtmlField(html: string, fieldKey: string): string | undefined {
  const match = html.match(
    new RegExp(
      `<div class="field-entry" data-field-key="${fieldKey}">[\\s\\S]*?<div class="value">([^<]+)</div>`,
      "i",
    ),
  );
  return cleanText(match?.[1]);
}

export function parseICollectVideoGameItemPage(
  html: string,
  itemUrl: string,
): ICollectMetadata | null {
  const itemId = itemUrl.match(/\/videogame\/(\d+)\/?$/i)?.[1];
  if (!itemId) return null;

  const blocks = parseJsonLdBlocks(html);
  const thing = blocks.find((block) => schemaTypes(block?.["@type"]).includes("Thing"));
  const properties = thing?.additionalProperty;

  const title =
    cleanText(thing?.name) ||
    cleanText(html.match(/<h1 class="important_value">([^<]+)<\/h1>/i)?.[1]);
  if (!title) return null;

  const images = parseMainImages(html);
  const coverUrl =
    cleanText(typeof thing?.image === "string" ? thing.image : thing?.image?.[0]) ||
    images[0]?.url;

  const barcode =
    cleanText(thing?.gtin13) ||
    parseHtmlField(html, "barcode") ||
    title.match(/\[Barcode\s+([0-9]+)\]/i)?.[1];

  const estimatedValueRaw =
    readAdditionalProperty(properties, "Automatic Estimated Value") ||
    parseHtmlField(html, "automatic_estimated_value");

  return {
    itemId,
    itemUrl,
    title,
    barcode: barcode || null,
    platform:
      readAdditionalProperty(properties, "Platform") ||
      parseHtmlField(html, "platform") ||
      null,
    publisher:
      readAdditionalProperty(properties, "Publisher") ||
      parseHtmlField(html, "publisher") ||
      null,
    developer: readAdditionalProperty(properties, "Developers") || null,
    description:
      readAdditionalProperty(properties, "Game Summary") ||
      parseHtmlField(html, "game_summary") ||
      null,
    releaseDate:
      readAdditionalProperty(properties, "Release Date") ||
      parseHtmlField(html, "release_date") ||
      null,
    coverUrl: coverUrl || null,
    images,
    players:
      readAdditionalProperty(properties, "Players") ||
      parseHtmlField(html, "players") ||
      null,
    ageRating:
      readAdditionalProperty(properties, "Rating") ||
      parseHtmlField(html, "rating") ||
      null,
    estimatedValueCents: parseEstimatedValueCents(estimatedValueRaw),
    estimatedValueDate:
      readAdditionalProperty(properties, "Automatic Estimated Date") ||
      parseHtmlField(html, "automatic_estimated_date") ||
      null,
    series: readAdditionalProperty(properties, "Series") || null,
    ignScore: readAdditionalProperty(properties, "IGN Score") || null,
    countryOfPurchase:
      readAdditionalProperty(properties, "Country of Purchase") ||
      parseHtmlField(html, "country") ||
      null,
    genres: [
      ...html.matchAll(
        /<div class="field-entry" data-field-key="genre">[\s\S]*?<div class="one_value">([^<]+)<\/div>/gi,
      ),
    ]
      .map((match) => cleanText(match[1]))
      .filter((value): value is string => Boolean(value)),
  };
}

async function streamSearchSitemapForBarcode(
  sitemapUrl: string,
  barcode: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const needles = barcodeSearchNeedles(barcode);
  if (needles.length === 0) return null;

  const response = await axios.get<Readable>(sitemapUrl, {
    headers: ICE_HEADERS,
    timeout: SITEMAP_STREAM_TIMEOUT_MS,
    responseType: "stream",
    signal,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      response.data.destroy();
      resolve(value);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      response.data.destroy();
      reject(error);
    };

    response.data.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      for (const needle of needles) {
        const marker = `[Barcode ${needle}]`;
        const markerIndex = buffer.indexOf(marker);
        if (markerIndex < 0) continue;
        finish(extractItemUrlFromSitemapContext(buffer, markerIndex));
        return;
      }
      if (buffer.length > 8_192) {
        buffer = buffer.slice(-SITEMAP_SCAN_OVERLAP);
      }
    });
    response.data.on("end", () => finish(null));
    response.data.on("error", fail);
    signal?.addEventListener(
      "abort",
      () => fail(new Error("icollect sitemap scan aborted")),
      { once: true },
    );
  });
}

let cachedVideoGameSitemapUrls: string[] | null = null;
const memoryItemUrlByBarcodeKey = new Map<
  string,
  { itemUrl: string; expires: number }
>();
const MEMORY_ITEM_URL_TTL_MS = 60 * 60 * 1000;

async function listVideoGameSitemapUrls(): Promise<string[]> {
  if (cachedVideoGameSitemapUrls) return cachedVideoGameSitemapUrls;
  const response = await axios.get<string>(ICE_SITEMAP_MASTER, {
    headers: ICE_HEADERS,
    timeout: ICE_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  cachedVideoGameSitemapUrls = parseVideoGameSitemapUrls(response.data);
  return cachedVideoGameSitemapUrls;
}

async function scanSitemapsForItemUrl(barcode: string): Promise<string | null> {
  const sitemapUrls = await listVideoGameSitemapUrls();
  if (sitemapUrls.length === 0) return null;

  const controller = new AbortController();
  const searches = sitemapUrls.map(async (sitemapUrl) => {
    try {
      const itemUrl = await streamSearchSitemapForBarcode(
        sitemapUrl,
        barcode,
        controller.signal,
      );
      if (itemUrl) controller.abort();
      return itemUrl;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(searches);
  return results.find((itemUrl): itemUrl is string => Boolean(itemUrl)) ?? null;
}

export async function resolveICollectVideoGameItemUrlByBarcode(
  barcode: string,
): Promise<string | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const barcodeKey = barcodeMatchKey(normalized);
  const memoryHit = memoryItemUrlByBarcodeKey.get(barcodeKey);
  if (memoryHit && memoryHit.expires > Date.now()) {
    return memoryHit.itemUrl;
  }

  const db = await ensureICollectIndex();
  if (db) {
    const cachedUrl = lookupICollectItemUrlByBarcodeKey(db, barcodeKey);
    if (cachedUrl) {
      memoryItemUrlByBarcodeKey.set(barcodeKey, {
        itemUrl: cachedUrl,
        expires: Date.now() + MEMORY_ITEM_URL_TTL_MS,
      });
      return cachedUrl;
    }
  }

  const itemUrl = await scanSitemapsForItemUrl(normalized);
  if (!itemUrl) return null;

  memoryItemUrlByBarcodeKey.set(barcodeKey, {
    itemUrl,
    expires: Date.now() + MEMORY_ITEM_URL_TTL_MS,
  });

  if (db) {
    rememberICollectBarcodeMapping(db, normalized, itemUrl);
  }

  return itemUrl;
}

export async function fetchICollectVideoGameItem(
  itemUrl: string,
): Promise<ICollectMetadata | null> {
  const itemId = itemUrl.match(/\/videogame\/(\d+)\/?$/i)?.[1];
  const db = itemId ? await ensureICollectIndex() : null;

  if (db && itemId) {
    const cachedPayload = readCachedICollectMetadata(db, itemId);
    if (cachedPayload) {
      try {
        return JSON.parse(cachedPayload) as ICollectMetadata;
      } catch {
        // Ignore corrupted cache rows.
      }
    }
  }

  const response = await axios.get<string>(itemUrl, {
    headers: ICE_HEADERS,
    timeout: ICE_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  const metadata = parseICollectVideoGameItemPage(response.data, itemUrl);
  if (metadata && db && itemId) {
    writeCachedICollectMetadata(db, itemId, JSON.stringify(metadata));
  }
  return metadata;
}

export async function fetchICollectMetadataByBarcode(
  barcode: string,
  options?: { requireBarcodeMatch?: boolean },
): Promise<ICollectMetadata | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const itemUrl = await resolveICollectVideoGameItemUrlByBarcode(normalized);
  if (!itemUrl) return null;

  const metadata = await fetchICollectVideoGameItem(itemUrl);
  if (!metadata) return null;

  if (
    options?.requireBarcodeMatch !== false &&
    metadata.barcode &&
    !barcodesEquivalent(metadata.barcode, normalized)
  ) {
    return null;
  }

  return metadata;
}

export async function pingICollect(): Promise<boolean> {
  try {
    const response = await axios.get(`${ICE_BASE}/games/`, {
      headers: ICE_HEADERS,
      timeout: ICE_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    return /iCollect Everything/i.test(response.data);
  } catch {
    return false;
  }
}

export function icollectPlatformKey(platform?: string | null) {
  return platform ? detectPlatformKey(platform) : null;
}

export function icollectCoverRegionRole(
  ageRating?: string | null,
): string | undefined {
  // Country of purchase is collector metadata, not box-art region — never use it here.
  return icollectCoverRegionFromAgeRating(ageRating);
}

export { icollectCoverRegionFromAgeRating } from "./imageLabels";
