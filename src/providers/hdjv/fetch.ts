import { fetchGetWithFlareFallback } from "@/lib/http/scrapeFetch";
import { decode as decodeHtmlEntities } from "html-entities";

import { cleanCode } from "@/core/identify/query";
import { detectVideoGamePlatformKey } from "@/core/identify/platforms/platforms";
import {
  extractBaseTitleVariant,
  gameProductIdentityMismatch,
  isMetadataTitleAligned,
  metadataTitleMatchScore,
} from "@/core/enrich/titleMatching";
import { slugify } from "@/lib/routing/slugs";

import { HDJV_PLATFORM_BY_KEY, resolveHdjvPlatform } from "./platforms";

export const HDJV_BASE_URL = "https://www.historiquedesjeuxvideo.com";
const HDJV_SEARCH_URL = `${HDJV_BASE_URL}/ajax_recherche_jeu.php`;
const MAX_HDJV_GALLERY_PAGES = 12;
const HDJV_SEARCH_TITLE_MIN_SCORE = 0.58;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

export interface HdjvSearchHit {
  label: string;
  title: string;
  support: string;
  ficheUrl: string;
  gameCode: string;
}

export interface HdjvFiche {
  title: string;
  ficheUrl: string;
  gameCode: string;
  platformLabel?: string;
  barcode?: string | null;
  publisher?: string | null;
  developer?: string | null;
  genre?: string | null;
  releaseDate?: string | null;
  players?: string | null;
  alternateTitle?: string | null;
}

export interface HdjvGalleryItem {
  url: string;
  label: string;
  type: "cover" | "screenshot" | "image";
  role?: string;
}

export interface HdjvGalleryResult {
  title: string;
  ficheUrl: string;
  gameCode: string;
  barcode?: string | null;
  coverUrl?: string | null;
  releaseDate?: string | null;
  players?: string | null;
  alternateTitle?: string | null;
  items: HdjvGalleryItem[];
}

function cleanQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueQueries(queryOrQueries: string | string[], limit = 6): string[] {
  const queries = Array.isArray(queryOrQueries)
    ? queryOrQueries
    : [queryOrQueries];
  const seen = new Set<string>();
  return queries
    .map(cleanQuery)
    .filter((query) => {
      const key = query.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function normalizeHdjvUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  let trimmed = url.trim();
  if (trimmed.startsWith("//")) {
    trimmed = `https:${trimmed}`;
  } else if (trimmed.startsWith("/")) {
    trimmed = `${HDJV_BASE_URL}${trimmed}`;
  }
  return trimmed.replace(
    /^https?:\/\/(?:www\.)?historiquedesjeuxvideo\.com/i,
    "https://www.historiquedesjeuxvideo.com",
  );
}

export function upgradeHdjvImageUrl(url?: string | null): string | undefined {
  const normalized = normalizeHdjvUrl(url);
  if (!normalized) return undefined;
  if (normalized.includes("/miniature/")) {
    return normalized.replace("/miniature/", "/");
  }
  return normalized;
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseFicheTitle(html: string): string | undefined {
  const h1 = html.match(/<h1[^>]*>([^<]+)</i)?.[1];
  if (h1?.trim()) {
    return stripHtml(h1)
      .replace(/\s*-\s*\d+\s*-\s*images.*$/i, "")
      .replace(/\s+sur\s+.+$/i, "")
      .trim();
  }
  const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  if (!titleTag) return undefined;
  return stripHtml(titleTag)
    .replace(/\s+sur\s+.+$/i, "")
    .replace(/\s+Jeu\s+Video\s*$/i, "")
    .trim();
}

function parseGameCode(html: string): string | undefined {
  const match = html.match(/galerie_jeu\.php\?page=\d+&code=(\d+)/i);
  return match?.[1];
}

function parseFicheField(html: string, label: string): string | undefined {
  const pattern = new RegExp(
    `<TD[^>]*id="texte_a_propos_gauche"[^>]*>\\s*${label}\\s*</TD>\\s*<TD[^>]*id="texte_a_propos_droite[^"]*"[^>]*>([\\s\\S]*?)</TD>`,
    "i",
  );
  const match = html.match(pattern);
  if (!match) return undefined;
  const value = stripHtml(match[1]);
  return value || undefined;
}

export function parseHdjvSearchResults(raw: unknown): HdjvSearchHit[] {
  if (!Array.isArray(raw)) return [];
  const hits: HdjvSearchHit[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const title = typeof record.value === "string" ? record.value.trim() : "";
    const support =
      typeof record.support === "string" ? record.support.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const ficheUrl = normalizeHdjvUrl(url);
    if (!label || !title || !ficheUrl || !code) continue;
    hits.push({
      label,
      title,
      support,
      ficheUrl,
      gameCode: code,
    });
  }
  return hits;
}

export function parseHdjvFichePage(
  html: string,
  ficheUrl: string,
): HdjvFiche | null {
  const title = parseFicheTitle(html);
  const gameCode = parseGameCode(html);
  if (!title || !gameCode) return null;

  const platformLabel = parseFicheField(html, "Support");
  const publisher = parseFicheField(html, "Editeur");
  const developer = parseFicheField(html, "D[eé]veloppeur");
  const genre = parseFicheField(html, "Genre");
  const releaseDate = parseFicheField(html, "Sortie officielle");
  const players = parseFicheField(html, "Joueurs max");
  const alternateTitle = parseFicheField(html, "Titre alternatif");
  const barcodeRaw = parseFicheField(html, "UPC/EAN");

  return {
    title,
    ficheUrl: normalizeHdjvUrl(ficheUrl) || ficheUrl,
    gameCode,
    platformLabel,
    barcode: barcodeRaw ? cleanCode(barcodeRaw) || barcodeRaw : null,
    publisher: publisher || null,
    developer: developer || null,
    genre: genre || null,
    releaseDate: releaseDate || null,
    players: players || null,
    alternateTitle: alternateTitle || null,
  };
}

function galleryLabelToAttachment(
  label: string,
): Pick<HdjvGalleryItem, "type" | "role"> {
  const normalized = label.toLowerCase();
  if (normalized.includes("verso")) {
    return { type: "cover", role: "back-fr" };
  }
  if (normalized.includes("recto") || normalized.includes("pochette")) {
    return { type: "cover", role: "fr" };
  }
  if (normalized.includes("screen")) {
    return { type: "screenshot" };
  }
  if (normalized.includes("disque")) {
    return { type: "image", role: "disc-fr" };
  }
  return { type: "image" };
}

export function parseHdjvGalleryPage(html: string): {
  items: HdjvGalleryItem[];
  pageCount: number;
} {
  const items: HdjvGalleryItem[] = [];
  const seen = new Set<string>();

  for (const block of html.matchAll(
    /<TR><TD id="texte_galerie" align="center">([^<]+)<\/TD><\/TR>\s*<TR><TD id="texte_galerie" align="center">\s*<img[^>]+src="([^"]+)"/gi,
  )) {
    const label = stripHtml(block[1]);
    const url = upgradeHdjvImageUrl(block[2]);
    if (!label || !url || url.includes("/miniature/") || seen.has(url))
      continue;
    seen.add(url);
    items.push({
      url,
      label,
      ...galleryLabelToAttachment(label),
    });
  }

  const pageNumbers = [
    ...html.matchAll(/galerie_jeu\.php\?page=(\d+)&code=\d+/gi),
  ]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((page) => Number.isFinite(page));
  const pageCount =
    pageNumbers.length > 0
      ? Math.max(...pageNumbers) + 1
      : items.length > 0
        ? 1
        : 0;

  return { items, pageCount };
}

function hdjvPlatformKeyFromSupport(support: string): string | null {
  const normalized = support.trim().toLowerCase();
  for (const [key, spec] of Object.entries(HDJV_PLATFORM_BY_KEY)) {
    if (!spec) continue;
    if (spec.ficheLabel.toLowerCase() === normalized) return key;
    if (spec.ficheLabel.toLowerCase().startsWith(normalized)) return key;
    if (normalized.startsWith(spec.ficheLabel.toLowerCase())) return key;
  }
  return detectVideoGamePlatformKey(support);
}

function isHdjvHitPlatformCompatible(
  platform: string | undefined,
  hit: HdjvSearchHit,
): boolean {
  const requested = detectVideoGamePlatformKey(platform || "");
  if (!requested) return true;
  const hitKey = hdjvPlatformKeyFromSupport(hit.support);
  if (!hitKey) return true;
  if (hitKey === requested) return true;
  if (
    (requested === "switch" || requested === "switch2") &&
    (hitKey === "switch" || hitKey === "switch2")
  ) {
    return true;
  }
  return false;
}

function buildHdjvAlignmentNames(
  query: string,
  alignmentQueries: string[] = [],
): string[] {
  const names = uniqueQueries([query, ...alignmentQueries]);
  const expanded: string[] = [];
  for (const name of names) {
    expanded.push(name);
    const base = extractBaseTitleVariant(name);
    if (base) expanded.push(base);
  }
  return uniqueQueries(expanded);
}

function scoreHdjvSearchHit(
  alignmentNames: string[],
  platform: string | undefined,
  hit: HdjvSearchHit,
): number {
  if (
    alignmentNames.some((name) =>
      gameProductIdentityMismatch([name], hit.title),
    )
  ) {
    return -1;
  }

  let titleScore = 0;
  for (const name of alignmentNames) {
    titleScore = Math.max(
      titleScore,
      metadataTitleMatchScore({ title: hit.title }, [name]),
    );
  }

  if (!isHdjvHitPlatformCompatible(platform, hit)) {
    titleScore -= 0.35;
  }

  return titleScore;
}

export function pickBestHdjvSearchHit(
  hits: HdjvSearchHit[],
  alignmentNames: string[],
  platform?: string,
): HdjvSearchHit | null {
  let best: { hit: HdjvSearchHit; score: number } | null = null;
  for (const hit of hits) {
    const score = scoreHdjvSearchHit(alignmentNames, platform, hit);
    if (score < 0.52) continue;
    if (
      !isMetadataTitleAligned(
        { title: hit.title },
        alignmentNames,
        HDJV_SEARCH_TITLE_MIN_SCORE,
      )
    ) {
      continue;
    }
    if (!best || score > best.score) {
      best = { hit, score };
    }
  }
  return best?.hit ?? null;
}

function buildHdjvFicheCandidates(
  queries: string[],
  platform?: string,
): string[] {
  const spec = resolveHdjvPlatform(platform);
  if (!spec) return [];

  const urls = new Set<string>();
  for (const query of queries) {
    const slug = slugify(query);
    if (!slug) continue;
    urls.add(
      `${HDJV_BASE_URL}/fiches/${encodeURIComponent(spec.ficheLabel)}/${slug}.html`,
    );
  }
  return [...urls];
}

function barcodeMatchesFiche(
  requestedBarcode: string | undefined | null,
  ficheBarcode: string | null | undefined,
): boolean {
  const requested = cleanCode(requestedBarcode || "");
  const observed = cleanCode(ficheBarcode || "");
  if (!requested || !observed) return true;
  return requested === observed;
}

async function hdjvGet(url: string): Promise<string> {
  const response = await fetchGetWithFlareFallback(url, {
    headers: HEADERS,
    timeout: 15000,
    maxRedirects: 5,
  });
  return response.data as string;
}

async function searchHdjv(
  query: string,
  supportCode: string,
): Promise<HdjvSearchHit[]> {
  const response = await fetchGetWithFlareFallback(HDJV_SEARCH_URL, {
    headers: HEADERS,
    params: { q: query, support: supportCode },
    timeout: 12000,
  });
  return parseHdjvSearchResults(response.data);
}

async function fetchHdjvGalleryPages(
  gameCode: string,
): Promise<HdjvGalleryItem[]> {
  const items: HdjvGalleryItem[] = [];
  const seen = new Set<string>();
  let pageCount = 1;

  for (
    let page = 0;
    page < Math.min(pageCount, MAX_HDJV_GALLERY_PAGES);
    page++
  ) {
    const html = await hdjvGet(
      `${HDJV_BASE_URL}/galerie_jeu.php?page=${page}&code=${gameCode}`,
    );
    const parsed = parseHdjvGalleryPage(html);
    for (const item of parsed.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
    pageCount = Math.max(pageCount, parsed.pageCount);
  }

  return items;
}

export async function fetchHdjvGallery(
  queryOrQueries: string | string[],
  platform?: string,
  barcode?: string | null,
  alignmentQueries: string[] = [],
): Promise<HdjvGalleryResult | null> {
  const queries = uniqueQueries(
    Array.isArray(queryOrQueries) ? queryOrQueries : [queryOrQueries],
  );
  if (queries.length === 0) return null;

  const alignmentNames = buildHdjvAlignmentNames(
    queries[0],
    alignmentQueries.length ? alignmentQueries : queries.slice(1),
  );
  const platformSpec = resolveHdjvPlatform(platform);
  const supportCode = platformSpec?.supportCode ?? "tous";

  let selectedHit: HdjvSearchHit | null = null;
  for (const query of queries) {
    const hits = await searchHdjv(query, supportCode);
    selectedHit = pickBestHdjvSearchHit(hits, alignmentNames, platform);
    if (selectedHit) break;
  }

  let fiche: HdjvFiche | null = null;

  if (selectedHit) {
    const ficheHtml = await hdjvGet(selectedHit.ficheUrl);
    fiche = parseHdjvFichePage(ficheHtml, selectedHit.ficheUrl);
  }

  if (!fiche) {
    for (const candidateUrl of buildHdjvFicheCandidates(queries, platform)) {
      try {
        const html = await hdjvGet(candidateUrl);
        const parsed = parseHdjvFichePage(html, candidateUrl);
        if (!parsed) continue;
        if (
          !isMetadataTitleAligned(
            { title: parsed.title },
            alignmentNames,
            HDJV_SEARCH_TITLE_MIN_SCORE,
          )
        ) {
          continue;
        }
        fiche = parsed;
        break;
      } catch {
        continue;
      }
    }
  }

  if (!fiche) return null;
  if (!barcodeMatchesFiche(barcode, fiche.barcode)) return null;

  const items = await fetchHdjvGalleryPages(fiche.gameCode);

  const coverItem =
    items.find((item) => item.role === "fr" && item.type === "cover") ??
    items.find((item) => item.type === "cover");

  return {
    title: fiche.title,
    ficheUrl: fiche.ficheUrl,
    gameCode: fiche.gameCode,
    barcode: fiche.barcode,
    coverUrl: coverItem?.url,
    releaseDate: fiche.releaseDate ?? undefined,
    players: fiche.players ?? undefined,
    alternateTitle: fiche.alternateTitle ?? undefined,
    items,
  };
}

export async function fetchFromHdjv(
  name: string,
  platform?: string | null,
  barcode?: string | null,
  lookupQueries?: string[],
): Promise<HdjvGalleryResult | null> {
  const queries = uniqueQueries(
    lookupQueries?.length ? lookupQueries : [name],
    8,
  );
  return fetchHdjvGallery(
    queries,
    platform ?? undefined,
    barcode ?? undefined,
    [name, ...queries],
  );
}

export async function pingHdjv(): Promise<boolean> {
  try {
    const response = await fetchGetWithFlareFallback(`${HDJV_BASE_URL}/`, {
      headers: HEADERS,
      timeout: 8000,
      validateStatus: (status) => status < 500,
    });
    return response.status < 400;
  } catch {
    return false;
  }
}
