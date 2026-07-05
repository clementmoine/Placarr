/**
 * Host/path fragments for CDNs that block anonymous `/_next/image` fetches.
 * Client-safe — no provider registry import. Kept in sync via
 * `remoteImageProxyHosts.test.ts` against registry `remoteImageReferer` providers.
 */
export const REMOTE_IMAGE_PROXY_HOST_FRAGMENTS = [
  "cdn1.booknode.com/book_cover/",
  "bedetheque.com/media/Couvertures/",
  "img.chasse-aux-livres.fr",
  "historiquedesjeuxvideo.com",
  "geedie.lt",
] as const;

const BLOCKED_PROXY_HOSTS =
  /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$|^(10\.|192\.168\.|169\.254\.)/i;

export function remoteImageUrlMatchesProxyHost(url: string): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  return REMOTE_IMAGE_PROXY_HOST_FRAGMENTS.some((fragment) =>
    url.includes(fragment),
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
