import { SCRAPE_CATALOG_IMAGE_BASE_URLS } from "@/core/enrich/media/scrapeCatalogImageHosts";
import {
  buildImageRemoteHostLists,
  catalogRetailerImageHosts,
  isNextImageRemoteHostAllowed,
  looksLikeRemoteImageUrl,
  normalizeImageRemoteHost,
  REGISTRY_COVER_IMAGE_EXACT_HOSTS,
  type ImageRemoteHostLists,
} from "@/core/enrich/media/nextImageRemoteHosts";

const BLOCKED_HOSTS_RE =
  /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$|^(10\.|192\.168\.|169\.254\.)/i;

let cachedLists: ImageRemoteHostLists | undefined;

export function resolveImageRemoteHostLists(): ImageRemoteHostLists {
  if (!cachedLists) {
    cachedLists = buildImageRemoteHostLists(
      catalogRetailerImageHosts(
        SCRAPE_CATALOG_IMAGE_BASE_URLS.map((baseUrl) => ({ baseUrl })),
      ),
      {
        wildcards: [],
        exacts: REGISTRY_COVER_IMAGE_EXACT_HOSTS,
      },
    );
  }
  return cachedLists;
}

export function isAllowedNextImageRemoteUrl(url: string): boolean {
  if (url.startsWith("/uploads/") || url.startsWith("/assets/")) return true;
  if (!looksLikeRemoteImageUrl(url)) return false;
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const host = normalizeImageRemoteHost(new URL(url).hostname);
    if (BLOCKED_HOSTS_RE.test(host)) return false;
    return isNextImageRemoteHostAllowed(host, resolveImageRemoteHostLists());
  } catch {
    return false;
  }
}
