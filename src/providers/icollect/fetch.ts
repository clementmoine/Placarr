import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";
import { Readable } from "node:stream";
import type { DatabaseSync } from "node:sqlite";

import { normalizeProductBarcode } from "@/core/barcode/normalize";
import { cleanCode, detectPlatformKey } from "@/core/barcode/query";
import {
  ensureICollectIndex,
  lookupICollectItemRefByBarcodeKey,
  readCachedICollectMetadata,
  rememberICollectBarcodeMapping,
  rememberICollectItemCatalog,
  shouldRefreshICollectItemPage,
} from "./indexStore";
import type { ICollectMetadata } from "./types";
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

export type { ICollectMetadata } from "./types";

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

type JsonLdSchema = Record<string, unknown>;

function parseJsonLdBlocks(html: string): JsonLdSchema[] {
  const blocks: JsonLdSchema[] = [];
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

function looksLikeCurrency(value: string): boolean {
  return /[€$£]|(?:^|\s)(?:EUR|USD|GBP)(?:\s|$)/i.test(value);
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(value.trim());
}

function isEpochSentinelDate(value: string): boolean {
  return /^1969-12-31|^1970-01-01/.test(value.trim());
}

/** Rejects iCollect rows where collector fields are misaligned (price → players, etc.). */
export function sanitizeICollectPlayers(
  value?: string | null,
): string | undefined {
  const text = cleanText(value);
  if (!text || looksLikeCurrency(text) || looksLikeIsoDate(text))
    return undefined;
  if (/player/i.test(text) && /\d/.test(text)) return text;
  if (/^\d+(?:\s*[-–—]\s*\d+)?$/.test(text)) return text;
  if (/^[12](?:\s*[-–—]\s*\d+)?$/.test(text)) return text;
  return undefined;
}

export function sanitizeICollectAgeRating(
  value?: string | null,
): string | undefined {
  const text = cleanText(value);
  if (!text || looksLikeCurrency(text)) return undefined;
  if (looksLikeIsoDate(text) || isEpochSentinelDate(text)) return undefined;
  return text;
}

export function sanitizeICollectReleaseDate(
  value?: string | null,
): string | undefined {
  const text = cleanText(value);
  if (!text || isEpochSentinelDate(text)) return undefined;
  if (looksLikeIsoDate(text)) {
    const year = Number.parseInt(text.slice(0, 4), 10);
    if (!Number.isFinite(year) || year < 1975 || year > 2035) return undefined;
  }
  return text;
}

export function sanitizeICollectPublisher(
  value?: string | null,
  barcode?: string | null,
): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 8 && barcodesEquivalent(digits, barcode))
    return undefined;
  if (/^\d{8,14}$/.test(digits) && digits === text.replace(/\s/g, "")) {
    return undefined;
  }
  return text;
}

export function sanitizeICollectCountry(
  value?: string | null,
): string | undefined {
  const text = cleanText(value);
  if (!text || looksLikeCurrency(text)) return undefined;
  if (looksLikeIsoDate(text) || isEpochSentinelDate(text)) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return undefined;
  return text;
}

export function sanitizeICollectMetadata(
  metadata: ICollectMetadata,
): ICollectMetadata {
  return {
    ...metadata,
    players: sanitizeICollectPlayers(metadata.players) ?? null,
    ageRating: sanitizeICollectAgeRating(metadata.ageRating) ?? null,
    releaseDate: sanitizeICollectReleaseDate(metadata.releaseDate) ?? null,
    publisher:
      sanitizeICollectPublisher(metadata.publisher, metadata.barcode) ?? null,
    countryOfPurchase:
      sanitizeICollectCountry(metadata.countryOfPurchase) ?? null,
    genres:
      metadata.genres && metadata.genres.length > 0 ? metadata.genres : undefined,
  };
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

function extractHtmlFieldBlock(html: string, fieldKey: string): string | undefined {
  const start = html.search(
    new RegExp(
      `<div class="field-entry" data-field-key="${fieldKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      "i",
    ),
  );
  if (start < 0) return undefined;
  const slice = html.slice(start);
  const next = slice.slice(1).search(/<div class="field-entry" data-field-key="/i);
  return next < 0 ? slice : slice.slice(0, next + 1);
}

function parseHtmlFieldList(html: string, fieldKey: string): string[] {
  const block = extractHtmlFieldBlock(html, fieldKey);
  if (!block) return [];

  const multi = [
    ...block.matchAll(/<div class="one_value">([\s\S]*?)<\/div>/gi),
  ]
    .map((match) => cleanText(match[1]))
    .filter((value): value is string => Boolean(value));
  if (multi.length > 0) return multi;

  const single = cleanText(
    block.match(/<div class="value">([\s\S]*?)<\/div>/i)?.[1],
  );
  return single ? [single] : [];
}

function parseHtmlFieldScalar(html: string, fieldKey: string): string | undefined {
  const values = parseHtmlFieldList(html, fieldKey);
  return values.length > 0 ? values.join(", ") : undefined;
}

/** @deprecated use parseHtmlFieldScalar */
function parseHtmlField(html: string, fieldKey: string): string | undefined {
  return parseHtmlFieldScalar(html, fieldKey);
}

function readScalarField(
  properties: unknown,
  html: string,
  jsonLdNames: string[],
  htmlKey: string,
): string | undefined {
  for (const name of jsonLdNames) {
    const value = readAdditionalProperty(properties, name);
    if (value) return value;
  }
  return parseHtmlFieldScalar(html, htmlKey);
}

function parseGenres(properties: unknown, html: string): string[] {
  const values = [
    ...parseHtmlFieldList(html, "genre"),
    ...parseHtmlFieldList(html, "sub_genre"),
    readAdditionalProperty(properties, "Genre"),
    readAdditionalProperty(properties, "Sub-Genre"),
  ]
    .map((value) => cleanText(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

export function parseICollectVideoGameItemPage(
  html: string,
  itemUrl: string,
): ICollectMetadata | null {
  const itemId = itemUrl.match(/\/videogame\/(\d+)\/?$/i)?.[1];
  if (!itemId) return null;

  const blocks = parseJsonLdBlocks(html);
  const thing = blocks.find((block) =>
    schemaTypes(block?.["@type"]).includes("Thing"),
  );
  const properties = thing?.additionalProperty;

  const title =
    cleanText(typeof thing?.name === "string" ? thing.name : undefined) ||
    cleanText(html.match(/<h1 class="important_value">([^<]+)<\/h1>/i)?.[1]);
  if (!title) return null;

  const images = parseMainImages(html);
  const coverUrl =
    cleanText(
      typeof thing?.image === "string"
        ? thing.image
        : Array.isArray(thing?.image) && typeof thing.image[0] === "string"
          ? thing.image[0]
          : undefined,
    ) || images[0]?.url;

  const barcode =
    cleanText(typeof thing?.gtin13 === "string" ? thing.gtin13 : undefined) ||
    parseHtmlField(html, "barcode") ||
    title.match(/\[Barcode\s+([0-9]+)\]/i)?.[1];

  const estimatedValueRaw =
    readScalarField(properties, html, ["Automatic Estimated Value"], "automatic_estimated_value") ||
    undefined;

  const inputDevices = parseHtmlFieldList(html, "input_device");

  return {
    itemId,
    itemUrl,
    title,
    barcode: barcode || null,
    platform:
      readScalarField(properties, html, ["Platform"], "platform") || null,
    publisher:
      sanitizeICollectPublisher(
        readScalarField(properties, html, ["Publisher"], "publisher") || null,
        barcode,
      ) || null,
    developer:
      readScalarField(
        properties,
        html,
        ["Developers", "Developer"],
        "developer",
      ) || null,
    description:
      readScalarField(
        properties,
        html,
        ["Game Summary"],
        "game_summary",
      ) || null,
    releaseDate:
      sanitizeICollectReleaseDate(
        readScalarField(properties, html, ["Release Date"], "release_date") ||
          null,
      ) || null,
    coverUrl: coverUrl || null,
    images,
    players:
      sanitizeICollectPlayers(
        readScalarField(properties, html, ["Players"], "players") || null,
      ) || null,
    ageRating:
      sanitizeICollectAgeRating(
        readScalarField(properties, html, ["Rating"], "rating") || null,
      ) || null,
    estimatedValueCents: parseEstimatedValueCents(estimatedValueRaw),
    estimatedValueDate:
      readScalarField(
        properties,
        html,
        ["Automatic Estimated Date"],
        "automatic_estimated_date",
      ) || null,
    series: readScalarField(properties, html, ["Series"], "series") || null,
    ignScore:
      readScalarField(properties, html, ["IGN Score"], "ign_score") || null,
    countryOfPurchase:
      sanitizeICollectCountry(
        readScalarField(
          properties,
          html,
          ["Country of Purchase"],
          "country",
        ) || null,
      ) || null,
    genres: parseGenres(properties, html),
    gameMode:
      readScalarField(properties, html, ["Game Mode"], "game_mode") || null,
    mediaType:
      readScalarField(properties, html, ["Media Type"], "media_type") || null,
    packaging:
      readScalarField(properties, html, ["Packaging"], "packaging") || null,
    discCount:
      readScalarField(properties, html, ["Discs", "Disc"], "discs") || null,
    graphics:
      readScalarField(properties, html, ["Graphics"], "graphics") || null,
    inputDevices: inputDevices.length > 0 ? inputDevices : undefined,
    in3d: readScalarField(properties, html, ["In 3D", "3D"], "in_3d") || null,
    vr: readScalarField(properties, html, ["VR"], "vr") || null,
    specialEdition:
      readScalarField(
        properties,
        html,
        ["Special Edition"],
        "special_edition",
      ) || null,
    seriesOrder:
      readScalarField(properties, html, ["Series Order"], "series_order") ||
      null,
    dateAdded:
      sanitizeICollectReleaseDate(
        readScalarField(properties, html, ["Date Added"], "date_added") ||
          null,
      ) || null,
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

function touchICollectCatalogSync(): void {
  void import("./catalogSync").then((mod) => {
    mod.startICollectCatalogSyncLoop();
    mod.maybeScheduleICollectCatalogSync();
  });
}

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
  touchICollectCatalogSync();
  if (db) {
    const cachedUrl = lookupICollectItemRefByBarcodeKey(db, barcodeKey)?.itemUrl;
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

function readLocalICollectMetadata(
  db: DatabaseSync,
  barcodeKey: string,
): ICollectMetadata | null {
  const itemRef = lookupICollectItemRefByBarcodeKey(db, barcodeKey);
  if (!itemRef) return null;

  const payload = readCachedICollectMetadata(db, itemRef.itemId);
  if (!payload) return null;

  try {
    const metadata = JSON.parse(payload) as ICollectMetadata;
    if (!metadata.title?.trim()) return null;
    return sanitizeICollectMetadata(metadata);
  } catch {
    return null;
  }
}

export async function fetchICollectVideoGameItem(
  itemUrl: string,
  options?: { bypassCache?: boolean; timeoutMs?: number },
): Promise<ICollectMetadata | null> {
  const itemId = itemUrl.match(/\/videogame\/(\d+)\/?$/i)?.[1];
  const db = itemId ? await ensureICollectIndex() : null;

  if (db && itemId && !process.env.RECORD && !options?.bypassCache) {
    const cachedPayload = readCachedICollectMetadata(db, itemId);
    if (cachedPayload) {
      try {
        return sanitizeICollectMetadata(
          JSON.parse(cachedPayload) as ICollectMetadata,
        );
      } catch {
        // Ignore corrupted cache rows.
      }
    }
  }

  const response = await axios.get<string>(itemUrl, {
    headers: ICE_HEADERS,
    timeout: options?.timeoutMs ?? ICE_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  const metadata = parseICollectVideoGameItemPage(response.data, itemUrl);
  if (metadata) {
    metadata.catalogSource = "page";
    if (db && itemId) {
      rememberICollectItemCatalog(db, metadata);
    }
  }
  return metadata ? sanitizeICollectMetadata(metadata) : null;
}

export async function fetchICollectMetadataByBarcode(
  barcode: string,
  options?: { requireBarcodeMatch?: boolean },
): Promise<ICollectMetadata | null> {
  const normalized = normalizeProductBarcode(barcode);
  if (!normalized) return null;

  const barcodeKey = barcodeMatchKey(normalized);
  const db = await ensureICollectIndex();
  touchICollectCatalogSync();

  const itemRef = db
    ? lookupICollectItemRefByBarcodeKey(db, barcodeKey)
    : null;
  const local =
    db && !process.env.RECORD
      ? readLocalICollectMetadata(db, barcodeKey)
      : null;

  const itemId =
    itemRef?.itemId ??
    local?.itemId ??
    undefined;
  const needsPageRefresh = Boolean(
    db &&
      itemId &&
      !process.env.RECORD &&
      shouldRefreshICollectItemPage(db, itemId),
  );

  if (local && !needsPageRefresh) {
    if (
      options?.requireBarcodeMatch !== false &&
      local.barcode &&
      !barcodesEquivalent(local.barcode, normalized)
    ) {
      return null;
    }
    return local;
  }

  const itemUrl =
    itemRef?.itemUrl ??
    (await resolveICollectVideoGameItemUrlByBarcode(normalized));
  if (!itemUrl) return null;

  const metadata = await fetchICollectVideoGameItem(itemUrl, {
    bypassCache: needsPageRefresh,
  });
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
