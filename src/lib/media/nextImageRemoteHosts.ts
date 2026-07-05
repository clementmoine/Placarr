/**
 * Remote hosts allowed by `next/image` (see `next.config.js`).
 *
 * Next.js 16 caps `images.remotePatterns` at 50 entries. Wildcard patterns use
 * `**.parent.tld` and only match subdomains — apex hosts (e.g. `imagedelivery.net`,
 * `chocobonplan.com`) must be listed in `IMAGE_REMOTE_EXACT_HOSTS`.
 *
 * PrestaShop/Shopify hosts are merged at the call site (`next.config.js`, tests)
 * so this module stays free of provider config imports (Node loads it from
 * `next.config.js` without TS path aliases).
 */
const STATIC_IMAGE_REMOTE_WILDCARD_HOSTS = [
  "achatmoinscher.com",
  "bedetheque.com",
  "booknode.com",
  "chasse-aux-livres.fr",
  "ebayimg.com",
  "geekdo-images.com",
  "google.com",
  "igdb.com",
  "launchbox-app.com",
  "ledenicheur.fr",
  "openlibrary.org",
  "pricecharting.com",
  "rawg.io",
  "screenscraper.fr",
  "steamgriddb.com",
  "thegamesdb.net",
  "tmdb.org",
] as const;

/** Apex or single-label hosts not covered by `**.parent.tld`. */
const STATIC_IMAGE_REMOTE_EXACT_HOSTS = [
  "bedetheque.com",
  "cdn-images.dzcdn.net",
  "chocobonplan.com",
  "coverproject.sfo2.cdn.digitaloceanspaces.com",
  "geedie.lt",
  "historiquedesjeuxvideo.com",
  "i.discogs.com",
  "icollecteverything.com",
  "imagedelivery.net",
  "rawg.io",
  "storage.googleapis.com",
  "upload.wikimedia.org",
] as const;

const IMAGE_REMOTE_PATTERN_LIMIT = 50;

const REMOTE_IMAGE_EXTENSION_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i;

const REMOTE_IMAGE_PATH_HINTS = [
  /mediajeu\.php/i,
  /\/image\/upload\//i,
  /book_cover/i,
  /couvertures/i,
  /photoprod/i,
  /ebayimg\.com/i,
  /images\.pricecharting\.com/i,
  /thegamesdb\.net\/images/i,
  /steamgriddb\.com/i,
  /imagedelivery\.net/i,
  /-large_default\//i,
  /-home_default\//i,
];

export type CatalogRetailerImageHosts = {
  wildcards: readonly string[];
  exacts: readonly string[];
};

export type ImageRemoteHostLists = {
  wildcards: readonly string[];
  exacts: readonly string[];
};

export function normalizeImageRemoteHost(host: string): string {
  return host.toLowerCase();
}

function dedupeSorted(hosts: readonly string[]): readonly string[] {
  return [...new Set(hosts.map(normalizeImageRemoteHost))].sort();
}

/**
 * PrestaShop/Shopify shops serve product images on their own domain
 * (`/{id}-large_default/...`). www shops → wildcard parent; apex shops → exact.
 */
export function catalogRetailerImageHosts(
  configs: ReadonlyArray<{ baseUrl: string }>,
): CatalogRetailerImageHosts {
  const wildcards = new Set<string>();
  const exacts = new Set<string>();

  for (const { baseUrl } of configs) {
    const host = normalizeImageRemoteHost(new URL(baseUrl).hostname);
    const apex = host.replace(/^www\./, "");
    if (host === apex) {
      exacts.add(apex);
    } else {
      wildcards.add(apex);
    }
  }

  return {
    wildcards: dedupeSorted([...wildcards]),
    exacts: dedupeSorted([...exacts]),
  };
}

export function buildImageRemoteHostLists(
  catalog: CatalogRetailerImageHosts = { wildcards: [], exacts: [] },
): ImageRemoteHostLists {
  return {
    wildcards: dedupeSorted([
      ...STATIC_IMAGE_REMOTE_WILDCARD_HOSTS,
      ...catalog.wildcards,
    ]),
    exacts: dedupeSorted([
      ...STATIC_IMAGE_REMOTE_EXACT_HOSTS,
      ...catalog.exacts,
    ]),
  };
}

/** Heuristic: URL likely points at image bytes (not a page, video, or wiki link). */
export function looksLikeRemoteImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url) || url.startsWith("/uploads")) return false;
  try {
    const parsed = new URL(url);
    if (REMOTE_IMAGE_EXTENSION_RE.test(parsed.pathname)) return true;
    return REMOTE_IMAGE_PATH_HINTS.some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}

function hostMatchesWildcardParent(host: string, parent: string): boolean {
  const normalized = normalizeImageRemoteHost(host);
  const parentNorm = normalizeImageRemoteHost(parent);
  if (normalized === parentNorm) return false;
  return normalized.endsWith(`.${parentNorm}`);
}

/** True when `next/image` may optimize a remote `https://` asset on this host. */
export function isNextImageRemoteHostAllowed(
  host: string,
  lists: ImageRemoteHostLists,
): boolean {
  const normalized = normalizeImageRemoteHost(host);
  if (
    lists.exacts.some((exact) => normalized === normalizeImageRemoteHost(exact))
  ) {
    return true;
  }
  return lists.wildcards.some((parent) =>
    hostMatchesWildcardParent(normalized, parent),
  );
}

export function nextImageRemotePatternCount(
  lists: ImageRemoteHostLists,
): number {
  return lists.wildcards.length + lists.exacts.length;
}

export function assertNextImageRemotePatternBudget(
  lists: ImageRemoteHostLists,
): void {
  const count = nextImageRemotePatternCount(lists);
  if (count > IMAGE_REMOTE_PATTERN_LIMIT) {
    throw new Error(
      `next/image remotePatterns budget exceeded: ${count}/${IMAGE_REMOTE_PATTERN_LIMIT}`,
    );
  }
}

export function nextImageRemotePatterns(
  catalog: CatalogRetailerImageHosts = { wildcards: [], exacts: [] },
): Array<{
  protocol: "https";
  hostname: string;
  pathname?: string;
}> {
  const lists = buildImageRemoteHostLists(catalog);
  assertNextImageRemotePatternBudget(lists);
  return [
    ...lists.wildcards.map((hostname) => ({
      protocol: "https" as const,
      hostname: `**.${hostname}`,
    })),
    ...lists.exacts.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  ];
}
