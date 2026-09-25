/**
 * Host/path fragments for CDNs that block anonymous `/_next/image` fetches.
 * Client-safe — no provider registry import. Kept in sync via
 * `remoteImageProxyHosts.test.ts` against registry `remoteImageReferer` providers.
 */
export const REMOTE_IMAGE_PROXY_HOST_FRAGMENTS = [
  "bdovore.com/images/couv/",
  "bedetheque.com/media/Couvertures/",
  "canalbd.b-cdn.net",
  "cdn.myanimelist.net",
  "cdn.rebrickable.com",
  "cdn.vivlio.com",
  "cdn1.booknode.com/book_cover/",
  "geedie.lt",
  "historiquedesjeuxvideo.com",
  "image.izneo.com",
  "images.brickset.com",
  "img.chasse-aux-livres.fr",
  "nautiljon.com/images/",
  "pictures.abebooks.com",
  "products-images.di-static.com",
  "static.bdphile.fr",
  "static.planetebd.com",
  "www.babelio.com",
  "www.bdfugue.com",
  "www.gibert.com",
] as const;

const BLOCKED_PROXY_HOSTS =
  /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$|^(10\.|192\.168\.|169\.254\.)/i;

/**
 * ScreenScraper media (`mediaJeu.php`) returns a login error unless developer
 * credentials are attached — so it must be fetched through our server proxy
 * (which injects them), never hotlinked by the client. Distinct from the
 * Referer-based CDNs above, hence not part of the registry-synced fragments.
 */
export function isScreenScraperMediaUrl(url: string): boolean {
  return /^https?:\/\/[^/]*screenscraper\.fr\/api2\/mediaJeu\.php/i.test(url);
}

export function remoteImageUrlMatchesProxyHost(url: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  return (
    REMOTE_IMAGE_PROXY_HOST_FRAGMENTS.some((fragment) =>
      url.includes(fragment),
    ) || isScreenScraperMediaUrl(url)
  );
}

export function isClientSafeRemoteImageProxyTarget(url: string): boolean {
  if (!remoteImageUrlMatchesProxyHost(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_PROXY_HOSTS.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}
