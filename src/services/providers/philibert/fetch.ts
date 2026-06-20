import axios from "axios";
import sharp from "sharp";
import { decode as decodeHTMLEntities } from "html-entities";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";

const BASE_URL = "https://www.philibertnet.com";

// Philibert ne sert le vrai ratio que sur l'URL originale (sans token de
// taille) : toutes les variantes nommées sont paddées en carré. On lit donc
// juste l'en-tête JPEG (Range) pour mesurer l'aspect sans rapatrier l'image.
const IMAGE_HEADER_RANGE = "bytes=0-65535";
// Un fond doit être plus large que haut pour rendre correctement en `bg-cover`.
const BACKGROUND_MIN_RATIO = 1.15;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

export interface PhilibertSearchHit {
  url: string;
  title?: string;
  barcode?: string;
}

export interface PhilibertReview {
  author?: string;
  rating?: string;
  text?: string;
}

export interface PhilibertProduct {
  title?: string;
  description?: string;
  imageUrl?: string;
  barcode?: string;
  reference?: string;
  productId?: string;
  priceCents?: number;
  players?: string;
  playtime?: string;
  ageRating?: string;
  language?: string;
  rating?: string;
  reviewCount?: number;
  reviews?: PhilibertReview[];
  themes?: string[];
  mechanics?: string[];
  designers?: string[];
  publishers?: string[];
  country?: string;
  /** Toutes les images produit de la fiche (URLs originales, dédupliquées). */
  images?: string[];
  /** Visuel large retenu comme arrière-plan (résolu via mesure d'aspect). */
  backgroundImageUrl?: string;
  productUrl: string;
}

function stripHtml(value: string): string {
  return decodeHTMLEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseFrenchPrice(value: string): number | undefined {
  const match = value.match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
  if (!match) return undefined;
  const normalized = match[1].replace(",", ".");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

export function parsePhilibertTopFeatures(html: string): {
  players?: string;
  playtime?: string;
  ageRating?: string;
  language?: string;
} {
  const labels = Array.from(
    html.matchAll(/product-top-features__item-label[^>]*>([\s\S]*?)<\/span>/gi),
  )
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);

  const result: {
    players?: string;
    playtime?: string;
    ageRating?: string;
    language?: string;
  } = {};

  for (const label of labels) {
    const playersMatch = label.match(/^(\d+(?:\s*à\s*\d+)?)\s+joueurs?$/i);
    if (playersMatch) {
      result.players = playersMatch[1].replace(/\s+/g, " ").trim();
      continue;
    }

    const ageMatch = label.match(/(?:à partir de|dès)\s*(\d+)\s*ans?/i);
    if (ageMatch) {
      result.ageRating = `${ageMatch[1]}+`;
      continue;
    }

    if (
      /\bmin\b/i.test(label) ||
      /\d\s*h\b/i.test(label) ||
      /\d+h\b/i.test(label)
    ) {
      result.playtime = label;
      continue;
    }

    if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]+$/.test(label) && label.length <= 24) {
      result.language = label;
    }
  }

  return result;
}

export function parsePhilibertFeatureRows(
  html: string,
): Record<string, string[]> {
  const rows: Record<string, string[]> = {};

  for (const match of html.matchAll(
    /<li class="product-features__item[^"]*"[\s\S]*?<\/li>/gi,
  )) {
    const item = match[0];
    const name = stripHtml(
      item.match(/product-features__name[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "",
    );
    if (!name) continue;

    const values = Array.from(
      item.matchAll(/product-features__value[^>]*>([\s\S]*?)<\/(?:a|span)>/gi),
    )
      .map((valueMatch) => stripHtml(valueMatch[1]))
      .filter(Boolean);

    if (values.length === 0) continue;
    rows[name] = Array.from(new Set([...(rows[name] || []), ...values]));
  }

  return rows;
}

export function parsePhilibertProductId(url: string): string | undefined {
  const match = url.match(/\/(\d+)-[^/]+\.html(?:\?|$)/i);
  return match?.[1];
}

/** Identifiant numérique d'une image dans une URL CDN Philibert. */
export function philibertImageId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  return url.match(/cdn1\.philibertnet\.com\/(\d+)/i)?.[1] ?? null;
}

/** Slug de fichier image attendu pour le produit (déduit de l'URL de la fiche). */
function parsePhilibertImageSlug(url: string): string | null {
  const file = url.split(/[?#]/)[0].split("/").pop() || "";
  const slug = file.replace(/\.html$/i, "").replace(/^\d+-/, "");
  return slug || null;
}

/**
 * Récupère les images produit de la fiche, dédupliquées par identifiant et
 * renvoyées en URL originale (seule à préserver le vrai ratio).
 *
 * Le filtrage par slug garantit qu'on ne ramasse jamais les images du carrousel
 * de produits liés (slug/code-barres différents dans le nom de fichier).
 */
export function parsePhilibertGalleryImages(
  html: string,
  url: string,
): string[] {
  const slug = parsePhilibertImageSlug(url);
  if (!slug) return [];

  const seen = new Set<string>();
  const images: string[] = [];
  for (const match of html.matchAll(
    /https:\/\/cdn1\.philibertnet\.com\/(\d+)(?:-[a-z_]+)?\/([^"'?\/ ]+)\.jpg/gi,
  )) {
    const [, id, file] = match;
    if (file !== slug || seen.has(id)) continue;
    seen.add(id);
    images.push(`https://cdn1.philibertnet.com/${id}/${slug}.jpg`);
  }
  return images;
}

/** Lit les dimensions d'une image en ne rapatriant que son en-tête JPEG. */
async function measurePhilibertImage(
  url: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      headers: { ...HEADERS, Accept: "image/*", Range: IMAGE_HEADER_RANGE },
      timeout: 8000,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const meta = await sharp(Buffer.from(response.data)).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/**
 * Choisit, parmi les images produit hors couverture, le visuel paysage le plus
 * grand pour servir d'arrière-plan. Renvoie `undefined` si aucune n'est large.
 */
export async function resolvePhilibertBackgroundUrl(
  product: PhilibertProduct,
): Promise<string | undefined> {
  const coverId = philibertImageId(product.imageUrl);
  const extras = (product.images ?? []).filter(
    (url) => philibertImageId(url) !== coverId,
  );

  let best: { url: string; area: number } | null = null;
  for (const url of extras) {
    const dim = await measurePhilibertImage(url);
    if (!dim) continue;
    if (dim.width / dim.height < BACKGROUND_MIN_RATIO) continue;
    const area = dim.width * dim.height;
    if (!best || area > best.area) best = { url, area };
  }
  return best?.url;
}

export function parsePhilibertReviewSummary(html: string): {
  rating?: string;
  reviewCount?: number;
} {
  const reviewBlock =
    html.match(/class="product-reviews[\s\S]{0,5000}/i)?.[0] || html;
  const rating = reviewBlock.match(
    /note-value">([0-9]+(?:[.,][0-9]+)?)\s*\/\s*5/i,
  )?.[1];
  const reviewCountMatch = html.match(/Voir les (\d+) avis/i);

  return {
    rating: rating?.replace(",", "."),
    reviewCount: reviewCountMatch
      ? Number.parseInt(reviewCountMatch[1], 10)
      : undefined,
  };
}

export function parsePhilibertReviewsHtml(html: string): PhilibertReview[] {
  const reviews: PhilibertReview[] = [];

  for (const match of html.matchAll(
    /class="review-content__reviews-item shadow-light[\s\S]*?(?=class="review-content__reviews-item shadow-light|$)/gi,
  )) {
    const item = match[0];
    const authorRaw = stripHtml(
      item.match(
        /review-content__reviews-item-header-content-name[^>]*>([\s\S]*?)<\//i,
      )?.[1] || "",
    );
    const author =
      authorRaw.replace(/^L['’]avis de\s+/i, "").trim() || undefined;
    const rating = item
      .match(/note-value">([0-9]+(?:[.,][0-9]+)?)\s*\/\s*5/i)?.[1]
      ?.replace(",", ".");
    const text = stripHtml(
      item.match(
        /review-content__reviews-item-content[^>]*>([\s\S]*?)<\/div>/i,
      )?.[1] ||
        item.match(
          /review-content__reviews-item-content-short[^>]*>([\s\S]*?)<\//i,
        )?.[1] ||
        "",
    ).slice(0, 280);

    if (!author && !rating && !text) continue;

    reviews.push({
      author,
      rating,
      text: text || undefined,
    });
  }

  return reviews;
}

export async function fetchPhilibertReviews(
  productId: string,
): Promise<PhilibertReview[]> {
  try {
    const response = await axios.get(
      `${BASE_URL}/fr/ajax/product/${productId}/reviews`,
      {
        headers: {
          ...HEADERS,
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 10000,
      },
    );
    const html =
      typeof response.data?.html === "string" ? response.data.html : "";
    return parsePhilibertReviewsHtml(html).slice(0, 5);
  } catch (error) {
    console.error("[Philibert] Reviews fetch failed:", error);
    return [];
  }
}

export function parsePhilibertProductHtml(
  html: string,
  url: string,
): PhilibertProduct {
  const title =
    stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") || undefined;

  const description =
    stripHtml(
      html.match(
        /id="product-description"[\s\S]*?<div class="product-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      )?.[1] ||
        html.match(
          /id="product-description"[^>]*>([\s\S]*?)<\/section>/i,
        )?.[1] ||
        html.match(/id="product-description"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
        "",
    ) || undefined;

  const imageCandidates = [
    ...html.matchAll(/https:\/\/cdn1\.philibertnet\.com\/[^"' ]+\.jpg/gi),
  ].map((match) => match[0].split("?")[0]);

  const imagePriority = [
    "large_default",
    "thickbox_default",
    "home_default",
    "medium_default",
    "small_default",
  ];
  const imageUrl =
    imagePriority
      .map((token) =>
        imageCandidates.find((candidate) => candidate.includes(token)),
      )
      .find(Boolean) || imageCandidates[0];

  const featureRows = parsePhilibertFeatureRows(html);
  const topFeatures = parsePhilibertTopFeatures(html);
  const reviewSummary = parsePhilibertReviewSummary(html);

  const barcodeFromUrl = url.match(/-(\d{8,14})\.html$/)?.[1];
  const barcode =
    featureRows.EAN?.[0] ||
    barcodeFromUrl ||
    html.match(/(?:EAN|GTIN)[^0-9]*([0-9]{8,14})/i)?.[1] ||
    undefined;

  const priceText =
    html.match(
      /<p class="price[^"]*"[^>]*>[\s\S]*?([0-9]+(?:[.,][0-9]{1,2})?)€/i,
    )?.[1] ||
    html.match(/itemprop="price"[^>]*content="([0-9.]+)"/i)?.[1] ||
    html.match(/"price_amount"\s*:\s*([0-9.]+)/i)?.[1];

  const priceCents = priceText ? parseFrenchPrice(`${priceText}€`) : undefined;

  return {
    title,
    description: description || undefined,
    imageUrl,
    images: parsePhilibertGalleryImages(html, url),
    barcode,
    reference: featureRows.Référence?.[0] || featureRows.Reference?.[0],
    productId: parsePhilibertProductId(url),
    priceCents,
    players: topFeatures.players,
    playtime: topFeatures.playtime,
    ageRating: topFeatures.ageRating,
    language: topFeatures.language || featureRows["Langue(s)"]?.[0],
    rating:
      reviewSummary.rating ||
      featureRows["Note globale"]?.[0]?.replace(",", "."),
    reviewCount: reviewSummary.reviewCount,
    themes: featureRows["Thème(s)"],
    mechanics: featureRows["Mécanisme(s)"],
    designers: featureRows.Création,
    publishers: featureRows.Editeur,
    country: featureRows["Pays de Provenance"]?.[0],
    productUrl: url,
  };
}

function parseProductLinks(
  html: string,
  preferredBarcode?: string,
): PhilibertSearchHit[] {
  const hits: PhilibertSearchHit[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /href="(\/fr\/[^"]+\/\d+-[^"]+\.html)"/gi,
  )) {
    const path = match[1];
    if (seen.has(path)) continue;
    seen.add(path);

    const barcodeMatch = path.match(/-(\d{8,14})\.html$/);
    const barcode = barcodeMatch?.[1];
    const slug =
      path
        .split("/")
        .pop()
        ?.replace(/\.html$/, "") || "";
    const titlePart = slug.replace(/-\d{8,14}$/, "").replace(/^\d+-/, "");
    const title = titlePart
      ? decodeHTMLEntities(
          titlePart
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" "),
        )
      : undefined;

    hits.push({
      url: `${BASE_URL}${path}`,
      title,
      barcode,
    });
  }

  if (preferredBarcode) {
    const exact = hits.filter((hit) => hit.barcode === preferredBarcode);
    if (exact.length > 0) return exact;
  }

  return hits;
}

export async function searchPhilibert(
  query: string,
  barcode?: string | null,
): Promise<PhilibertSearchHit | null> {
  const cleanedQuery = query.trim();
  const cleanedBarcode = barcode?.replace(/[^\d]/g, "") || "";
  const searchTerm = cleanedBarcode || cleanedQuery;
  if (!searchTerm) return null;

  try {
    const response = await axios.get(`${BASE_URL}/fr/recherche`, {
      params: { search_query: searchTerm },
      headers: HEADERS,
      timeout: 10000,
    });
    const hits = parseProductLinks(response.data, cleanedBarcode || undefined);
    return hits[0] || null;
  } catch (error) {
    console.error("[Philibert] Search failed:", error);
    return null;
  }
}

export async function fetchPhilibertProduct(
  url: string,
): Promise<PhilibertProduct> {
  const response = await axios.get(url, {
    headers: HEADERS,
    timeout: 10000,
  });

  const product = parsePhilibertProductHtml(response.data as string, url);
  if (product.productId) {
    product.reviews = await fetchPhilibertReviews(product.productId);
  }

  return product;
}

export type BarcodeProductHit = {
  title: string;
  imageUrl?: string | null;
  /** New price (cents) read from the same product page as the identification. */
  priceCents?: number | null;
};

export async function fetchPhilibertBarcodeProduct(
  barcode: string,
): Promise<BarcodeProductHit | null> {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) return null;

  try {
    const hit = await searchPhilibert("", normalizedBarcode);
    if (!hit) return null;

    const product = await fetchPhilibertProduct(hit.url);
    const title = product.title || hit.title;
    if (!title) return null;

    const resolvedBarcode =
      normalizeProductBarcode(product.barcode) ||
      normalizeProductBarcode(hit.barcode);
    if (resolvedBarcode !== normalizedBarcode) return null;

    return {
      title,
      imageUrl: product.imageUrl || null,
      priceCents: product.priceCents ?? null,
    };
  } catch (error) {
    console.error("[Philibert] Barcode lookup failed:", error);
    return null;
  }
}
