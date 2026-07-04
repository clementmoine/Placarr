/**
 * Remote hosts allowed by `next/image` (see `next.config.js`).
 *
 * Next.js 16 caps `images.remotePatterns` at 50 entries. Wildcard patterns use
 * `**.parent.tld` and only match subdomains — apex hosts (e.g. `imagedelivery.net`,
 * `chocobonplan.com`) must be listed in `IMAGE_REMOTE_EXACT_HOSTS`.
 */
export const IMAGE_REMOTE_WILDCARD_HOSTS = [
  "achatmoinscher.com",
  "apriloshop.fr",
  "bcd-jeux.fr",
  "bedetheque.com",
  "booknode.com",
  "chasse-aux-livres.fr",
  "ebayimg.com",
  "fnac-static.com",
  "freakxy.fr",
  "geedie.lt",
  "geekdo-images.com",
  "googleapis.com",
  "google.com",
  "historiquedesjeuxvideo.com",
  "icollecteverything.com",
  "igdb.com",
  "ledenicheur.fr",
  "netgamesretro.com",
  "okkazeo.com",
  "openlibrary.org",
  "philibertnet.com",
  "picclickimg.com",
  "pji.nu",
  "pricecharting.com",
  "prisjakt.nu",
  "rawg.io",
  "screenscraper.fr",
  "smartoys.be",
  "steamgriddb.com",
  "thegamesdb.net",
  "tmdb.org",
  "launchbox-app.com",
] as const;

/** Apex or single-label hosts not covered by `**.parent.tld`. */
export const IMAGE_REMOTE_EXACT_HOSTS = [
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
];

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

export function normalizeImageRemoteHost(host: string): string {
  return host.toLowerCase();
}

function hostMatchesWildcardParent(host: string, parent: string): boolean {
  const normalized = normalizeImageRemoteHost(host);
  const parentNorm = normalizeImageRemoteHost(parent);
  if (normalized === parentNorm) return false;
  return normalized.endsWith(`.${parentNorm}`);
}

/** True when `next/image` may optimize a remote `https://` asset on this host. */
export function isNextImageRemoteHostAllowed(host: string): boolean {
  const normalized = normalizeImageRemoteHost(host);
  if (
    IMAGE_REMOTE_EXACT_HOSTS.some(
      (exact) => normalized === normalizeImageRemoteHost(exact),
    )
  ) {
    return true;
  }
  return IMAGE_REMOTE_WILDCARD_HOSTS.some((parent) =>
    hostMatchesWildcardParent(normalized, parent),
  );
}

export function nextImageRemotePatternCount(): number {
  return (
    IMAGE_REMOTE_WILDCARD_HOSTS.length +
    IMAGE_REMOTE_EXACT_HOSTS.length
  );
}

export function assertNextImageRemotePatternBudget(): void {
  const count = nextImageRemotePatternCount();
  if (count > IMAGE_REMOTE_PATTERN_LIMIT) {
    throw new Error(
      `next/image remotePatterns budget exceeded: ${count}/${IMAGE_REMOTE_PATTERN_LIMIT}`,
    );
  }
}

export function nextImageRemotePatterns(): Array<{
  protocol: "https";
  hostname: string;
  pathname?: string;
}> {
  assertNextImageRemotePatternBudget();
  return [
    ...IMAGE_REMOTE_WILDCARD_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname: `**.${hostname}`,
    })),
    ...IMAGE_REMOTE_EXACT_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  ];
}
