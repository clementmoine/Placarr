/**
 * CDN URL upgrades derived from URL structure alone (no provider id literals).
 * Candidates are ordered highest-resolution first for cover downloads.
 */

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  return ordered;
}

function replaceSizeToken(
  url: string,
  pattern: RegExp,
  replacement: string,
): string | null {
  if (!pattern.test(url)) return null;
  return url.replace(pattern, replacement);
}

/** eBay Browse thumbnails: /s-l225.jpg → larger CDN renditions. */
function ebayCoverCandidates(url: string): string[] {
  if (!/i\.ebayimg\.com/i.test(url)) return [];
  const sizePattern = /\/s-l\d+(\.(jpe?g|png|webp))(\?.*)?$/i;
  if (!sizePattern.test(url)) return [];
  return ["s-l1600", "s-l500", "s-l400", "s-l300"]
    .map((size) =>
      replaceSizeToken(
        url,
        /\/s-l\d+(\.(jpe?g|png|webp))(\?.*)?$/i,
        `/${size}$1$3`,
      ),
    )
    .filter((value): value is string => Boolean(value));
}

/** Open Library cover sizes: -S/-M → -L. */
function openLibraryCoverCandidates(url: string): string[] {
  if (!/covers\.openlibrary\.org/i.test(url)) return [];
  return [url.replace(/-(S|M)\.(jpe?g|png|webp)(\?.*)?$/i, "-L.$2$3")];
}

/** TMDB poster paths: /w500/ → /original/. */
function tmdbCoverCandidates(url: string): string[] {
  if (!/image\.tmdb\.org\/t\/p\//i.test(url)) return [];
  return [
    url.replace(/\/w\d+\//, "/original/"),
    url.replace(/\/w\d+\//, "/w1280/"),
  ];
}

/** IGDB image API size tokens. */
function igdbCoverCandidates(url: string): string[] {
  const match = url.match(
    /^(https:\/\/images\.igdb\.com\/igdb\/image\/upload\/)t_[^/]+\/([^./?#]+)\.(jpe?g|png|webp)(\?.*)?$/i,
  );
  if (!match) return [];
  const [, prefix, imageId, ext, query = ""] = match;
  const sizes = [
    "cover_big",
    "1080p",
    "720p",
    "screenshot_huge",
    "screenshot_big",
  ];
  return sizes.map((size) => `${prefix}t_${size}/${imageId}.${ext}${query}`);
}

/** PriceCharting / LeDenicheur CDN numeric size suffixes. */
function priceChartingCoverCandidates(url: string): string[] {
  if (!/images\.pricecharting\.com|cdn\.pji\.nu|prisjakt\.nu/i.test(url)) {
    return [];
  }
  const candidates: string[] = [];
  if (/images\.pricecharting\.com/i.test(url)) {
    candidates.push(
      url.replace(/\/(\d+)\.(jpe?g|png|webp)(\?.*)?$/i, "/1600.$2$3"),
      url.replace(/\/(\d+)\.(jpe?g|png|webp)(\?.*)?$/i, "/800.$2$3"),
    );
  }
  candidates.push(url.replace(/\.(jpe?g|png|webp|gif|svg)\?.*$/i, ".$1"));
  return candidates;
}

/** Deezer album art dimension tokens in path. */
function deezerCoverCandidates(url: string): string[] {
  if (!/dzcdn\.net/i.test(url)) return [];
  return [
    url.replace(/\/(\d+)x(\d+)-/, "/1000x1000-"),
    url.replace(/\/(\d+)x(\d+)-/, "/500x500-"),
  ];
}

/** Cloudflare Images delivery paths. */
function cloudflareImageDeliveryCandidates(url: string): string[] {
  if (!/imagedelivery\.net/i.test(url)) return [];
  return [url.replace(/\/thumbnail(\?.*)?$/i, "/public$1")];
}

/** Query-string width/height upscales (Chasse-style CDNs, Prisjakt, etc.). */
function querySizedCoverCandidates(url: string): string[] {
  const [base, query = ""] = url.split("?");
  if (!query) return [];
  if (!/(^|&)(w|h|width|height)=\d+/i.test(query)) return [];
  const candidates: string[] = [];
  for (const size of [1600, 1200, 800]) {
    const params = new URLSearchParams(query);
    if (params.has("w")) params.set("w", String(size));
    if (params.has("width")) params.set("width", String(size));
    if (params.has("h")) params.set("h", String(size));
    if (params.has("height")) params.set("height", String(size));
    candidates.push(`${base}?${params.toString()}`);
  }
  candidates.push(base);
  return candidates;
}

/** Shopify-style size suffixes in filenames. */
function shopifySizedCoverCandidates(url: string): string[] {
  const match = url.match(
    /^(.*)_(?:pico|icon|thumb|small|compact|medium|large|grande|original)(\.\w+)(\?.*)?$/i,
  );
  if (!match) return [];
  const [, stem, ext, query = ""] = match;
  return [`${stem}${ext}${query}`, `${stem}_grande${ext}${query}`];
}

/**
 * Ordered cover URL candidates (best first) from observable CDN URL shapes.
 */
export function structuralCoverDownloadCandidates(url: string): string[] {
  if (!url?.startsWith("http")) return [url];

  const variants = [
    ...ebayCoverCandidates(url),
    ...openLibraryCoverCandidates(url),
    ...tmdbCoverCandidates(url),
    ...igdbCoverCandidates(url),
    ...priceChartingCoverCandidates(url),
    ...deezerCoverCandidates(url),
    ...cloudflareImageDeliveryCandidates(url),
    ...querySizedCoverCandidates(url),
    ...shopifySizedCoverCandidates(url),
  ];

  return uniqueOrdered([...variants, url]);
}

/** Best canonical URL to store before download localization. */
export function bestStructuralCoverUrl(url: string): string {
  return structuralCoverDownloadCandidates(url)[0] ?? url;
}
