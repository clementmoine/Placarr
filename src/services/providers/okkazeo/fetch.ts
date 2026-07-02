import axios from "axios";
import { decode as decodeHTMLEntities } from "html-entities";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";

const BASE_URL = "https://www.okkazeo.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

export interface OkkazeoSearchHit {
  url: string;
  gameId?: string;
}

export interface OkkazeoGame {
  title?: string;
  description?: string;
  imageUrl?: string;
  barcode?: string;
  players?: string;
  playtime?: string;
  ageRating?: string;
  year?: string;
  categories?: string[];
  priceCents?: number;
  productUrl: string;
  listingTitles?: string[];
}

function stripHtml(value: string): string {
  return decodeHTMLEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

type OkkazeoJsonLd = {
  name?: string;
  description?: string;
  image?: string;
  gtin13?: string;
  priceCents?: number;
};

/**
 * Parse the schema.org Product JSON-LD block — preferred over HTML scraping
 * because it carries the clean canonical name, description, image, gtin13 and
 * price in a stable structured form.
 */
export function parseOkkazeoJsonLd(html: string): OkkazeoJsonLd {
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const product = node as Record<string, unknown>;
      const type = product["@type"];
      const isProduct = Array.isArray(type)
        ? type.includes("Product")
        : type === "Product";
      if (!isProduct) continue;

      const offers = (product.offers as Record<string, unknown>) || {};
      const lowPriceRaw = offers.lowPrice ?? offers.price;
      const lowPrice =
        typeof lowPriceRaw === "number"
          ? lowPriceRaw
          : Number.parseFloat(String(lowPriceRaw ?? ""));

      return {
        name:
          typeof product.name === "string" ? product.name.trim() : undefined,
        description:
          typeof product.description === "string"
            ? product.description.trim()
            : undefined,
        image:
          typeof product.image === "string" ? product.image.trim() : undefined,
        gtin13:
          typeof product.gtin13 === "string"
            ? product.gtin13.replace(/[^\d]/g, "")
            : undefined,
        priceCents: Number.isFinite(lowPrice)
          ? Math.round(lowPrice * 100)
          : undefined,
      };
    }
  }
  return {};
}

function parseMetaContent(html: string, property: string): string | undefined {
  const match = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
  );
  return match ? decodeHTMLEntities(match[1].trim()) : undefined;
}

/** Read a labelled fact, e.g. `title="Nombre de joueurs"></i> 2 à 5 joueurs </div>`. */
function parseLabelledFact(html: string, label: string): string | undefined {
  const match = html.match(
    new RegExp(`title="${label}"[^>]*></i>\\s*([^<]+?)\\s*</`, "i"),
  );
  const value = match ? stripHtml(match[1]) : "";
  return value || undefined;
}

export function parseOkkazeoGameHtml(html: string, url: string): OkkazeoGame {
  const jsonLd = parseOkkazeoJsonLd(html);
  const ogTitle = parseMetaContent(html, "og:title");
  const ogDescription = parseMetaContent(html, "og:description") || "";

  // og:description example:
  // "Mille Sabords - 4 annonces … - 2 à 5 joueurs - 2013 - Jeu de dés,Pirates"
  const year = ogDescription.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const categories = ogDescription
    .split(" - ")
    .pop()
    ?.split(",")
    .map((category) => category.trim())
    .filter(Boolean);

  const title =
    jsonLd.name ||
    ogTitle?.replace(/\s*-\s*Jeu de soci[ée]t[ée].*$/i, "").trim() ||
    undefined;

  return {
    title: title || undefined,
    description: jsonLd.description,
    imageUrl: jsonLd.image || parseMetaContent(html, "og:image"),
    barcode: jsonLd.gtin13,
    players:
      parseLabelledFact(html, "Nombre de joueurs") ||
      ogDescription.match(/(?:\d+\s*à\s*\d+|\d+)\s+joueurs?/i)?.[0],
    playtime: parseLabelledFact(html, "Durée d'une partie"),
    ageRating: parseLabelledFact(html, "Age conseillé"),
    year,
    categories: categories && categories.length > 0 ? categories : undefined,
    priceCents: jsonLd.priceCents,
    productUrl: url,
    listingTitles: parseOkkazeoListingTitles(html),
  };
}

/** Marketplace listing titles embedded in the product page (offers block). */
export function parseOkkazeoListingTitles(html: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const match of html.matchAll(/\[titre\]\s*=>\s*([^\n\[]+)/gi)) {
    const title = stripHtml(match[1]);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

/** Canonical game links `/jeux/<id>/<slug>` in a results page. */
export function parseOkkazeoSearchHits(
  html: string,
  limit = 8,
): OkkazeoSearchHit[] {
  const seen = new Set<string>();
  const hits: OkkazeoSearchHit[] = [];
  for (const match of html.matchAll(/href="(\/jeux\/(\d+)\/[^"]+)"/gi)) {
    const gameId = match[2];
    if (seen.has(gameId)) continue;
    seen.add(gameId);
    hits.push({ url: `${BASE_URL}${match[1]}`, gameId });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** First canonical game link `/jeux/<id>/<slug>` in a results page. */
export function parseOkkazeoSearchHit(html: string): OkkazeoSearchHit | null {
  return parseOkkazeoSearchHits(html, 1)[0] ?? null;
}

export async function searchOkkazeoHits(
  query: string,
  barcode?: string | null,
  limit = 8,
): Promise<OkkazeoSearchHit[]> {
  const ean = (barcode || "").replace(/[^\d]/g, "");
  const cleanedQuery = query.trim();
  if (!ean && !cleanedQuery) return [];

  const params = ean
    ? { ean, titre_jeu: "", action: "Rechercher" }
    : { ean: "", titre_jeu: cleanedQuery, action: "Rechercher" };

  try {
    const response = await axios.get(`${BASE_URL}/jeux/resultats`, {
      params,
      headers: HEADERS,
      timeout: 10000,
    });
    return parseOkkazeoSearchHits(response.data as string, limit);
  } catch (error) {
    console.error("[Okkazeo] Search failed:", error);
    return [];
  }
}

export async function searchOkkazeo(
  query: string,
  barcode?: string | null,
): Promise<OkkazeoSearchHit | null> {
  const hits = await searchOkkazeoHits(query, barcode, 1);
  return hits[0] ?? null;
}

export async function fetchOkkazeoGame(url: string): Promise<OkkazeoGame> {
  const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  return parseOkkazeoGameHtml(response.data as string, url);
}

export type OkkazeoBarcodeHit = {
  title: string;
  imageUrl?: string | null;
  priceCents?: number | null;
  players?: string | null;
};

export async function fetchOkkazeoBarcodeProduct(
  barcode: string,
): Promise<OkkazeoBarcodeHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const hit = await searchOkkazeo("", normalizedBarcode);
    if (!hit) return null;

    const game = await fetchOkkazeoGame(hit.url);
    if (!game.title) return null;

    // The EAN search already matched the game, and the page's gtin13 confirms
    // it. Reject only on an explicit mismatch so barcode→item is never
    // confidently wrong.
    const resolvedBarcode = normalizeProductBarcode(game.barcode);
    if (resolvedBarcode && resolvedBarcode !== normalizedBarcode) return null;

    return {
      title: game.title,
      imageUrl: game.imageUrl || null,
      priceCents: game.priceCents ?? null,
      players: game.players ?? null,
    };
  } catch (error) {
    console.error("[Okkazeo] Barcode lookup failed:", error);
    return null;
  }
}
