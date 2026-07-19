/**
 * Runtime allowlist for remote images served through `/_next/image`.
 *
 * `next.config.js` uses a single `hostname: "**"` pattern (Next.js caps
 * `remotePatterns` at 50). Host validation runs in `proxy.ts` via
 * `nextImageRemoteGuard.ts`.
 *
 * Hosts are derived from the provider registry (`coverUrlHost`, templates,
 * `coverProvenanceRules`) plus PrestaShop/Shopify shop domains. Supplemental
 * lists cover CDNs not yet declared on a provider module.
 */
const SUPPLEMENTAL_IMAGE_REMOTE_WILDCARD_HOSTS = [
  "achatmoinscher.com",
  "amazon.com",
  "bdovore.com",
  "bedetheque.com",
  "booknode.com",
  "chasse-aux-livres.fr",
  "ebayimg.com",
  "geekdo-images.com",
  "google.com",
  "icollecteverything.com",
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

/** Apex or CDN hosts not covered by `**.parent.tld` alone. */
const SUPPLEMENTAL_IMAGE_REMOTE_EXACT_HOSTS = [
  "bedetheque.com",
  "cdn-images.dzcdn.net",
  "chocobonplan.com",
  "coverproject.sfo2.cdn.digitaloceanspaces.com",
  "geedie.lt",
  "historiquedesjeuxvideo.com",
  "howlongtobeat.com",
  "i.discogs.com",
  "icollecteverything.com",
  "imagedelivery.net",
  "media.senscritique.com",
  "rawg.io",
  "storage.googleapis.com",
  "upload.wikimedia.org",
] as const;

/**
 * Exact hosts from provider `coverUrlHost` / ISBN templates / provenance rules.
 * Kept in sync with the registry via `nextImageRemoteHosts.test.ts` (no runtime
 * `PROVIDERS` import — middleware and client bundles must stay registry-free).
 */
export const REGISTRY_COVER_IMAGE_EXACT_HOSTS = [
  "babelio.com",
  "bdovore.com",
  "bedetheque.com",
  "canalbd.b-cdn.net",
  "cdn.vivlio.com",
  "cdn1.booknode.com",
  "covers.openlibrary.org",
  "geedie.lt",
  "historiquedesjeuxvideo.com",
  "i.ebayimg.com",
  "icollecteverything.com",
  "image.izneo.com",
  "imagedelivery.net",
  "img.chasse-aux-livres.fr",
  "media.senscritique.com",
  "pictures.abebooks.com",
  "products-images.di-static.com",
  "rawg.io",
  "screenscraper.fr",
  "static.bdphile.fr",
  "static.planetebd.com",
  "www.babelio.com",
  "www.bdfugue.com",
  "www.bdovore.com",
  "www.gibert.com",
] as const;

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

export function hostFromCoverUrlFragment(fragment: string): string | null {
  const trimmed = fragment.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http")) {
    try {
      return normalizeImageRemoteHost(new URL(trimmed).hostname);
    } catch {
      return null;
    }
  }
  const candidate = trimmed.split("/")[0]?.trim();
  if (!candidate || !candidate.includes(".")) return null;
  return normalizeImageRemoteHost(candidate);
}

/**
 * Hosts declared on provider modules (`coverUrlHost`, ISBN templates,
 * `coverProvenanceRules`). Returns exact hosts only — wildcard parents live in
 * the supplemental list until migrated to per-provider declarations.
 */
export function registryCoverImageHosts(
  providers: ReadonlyArray<{
    coverUrlHost?: string;
    isbnCoverUrlTemplate?: string;
    coverProvenanceRules?: Readonly<Record<string, readonly string[]>>;
  }>,
): CatalogRetailerImageHosts {
  const exacts = new Set<string>();

  for (const provider of providers) {
    const fragments: string[] = [];
    if (provider.coverUrlHost) fragments.push(provider.coverUrlHost);
    if (provider.isbnCoverUrlTemplate) {
      fragments.push(provider.isbnCoverUrlTemplate);
    }
    if (provider.coverProvenanceRules) {
      for (const rules of Object.values(provider.coverProvenanceRules)) {
        fragments.push(...rules);
      }
    }
    for (const fragment of fragments) {
      const host = hostFromCoverUrlFragment(fragment);
      if (host) exacts.add(host);
    }
  }

  return {
    wildcards: [],
    exacts: dedupeSorted([...exacts]),
  };
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
  registry: CatalogRetailerImageHosts = { wildcards: [], exacts: [] },
): ImageRemoteHostLists {
  return {
    wildcards: dedupeSorted([
      ...SUPPLEMENTAL_IMAGE_REMOTE_WILDCARD_HOSTS,
      ...registry.wildcards,
      ...catalog.wildcards,
    ]),
    exacts: dedupeSorted([
      ...SUPPLEMENTAL_IMAGE_REMOTE_EXACT_HOSTS,
      ...registry.exacts,
      ...catalog.exacts,
    ]),
  };
}

/** `next.config.js` — single wildcard entry; runtime guard enforces the allowlist. */
export const NEXT_IMAGE_CONFIG_REMOTE_PATTERNS = [
  {
    protocol: "https" as const,
    hostname: "**",
  },
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

function hostMatchesWildcardParent(host: string, parent: string): boolean {
  const normalized = normalizeImageRemoteHost(host);
  const parentNorm = normalizeImageRemoteHost(parent);
  if (normalized === parentNorm) return false;
  return normalized.endsWith(`.${parentNorm}`);
}

/** True when `/_next/image` may optimize a remote `https://` asset on this host. */
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
