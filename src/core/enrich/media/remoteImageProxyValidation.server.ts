import { remoteImageProxyProviderFor } from "@/core/enrich/media/remoteProxy";
import { isScreenScraperMediaUrl } from "@/core/enrich/media/remoteImageProxyHosts";

/**
 * Defence in depth behind the provider-host allowlist: a provider hostname that
 * resolves to a private address must not turn this route into an SSRF probe.
 * `172.16/12` matters most — it is Docker's default bridge range, so it covers
 * the app's own neighbours.
 */
const BLOCKED_PROXY_HOSTS =
  /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$|^(10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)|\.local$|^\[?f[cd][0-9a-f]{2}:/i;

/** Server-side allowlist for `/api/media/remote` (registry-backed). */
export function isAllowedRemoteImageProxyTarget(url: string): boolean {
  if (
    !url ||
    (!remoteImageProxyProviderFor(url) && !isScreenScraperMediaUrl(url))
  )
    return false;
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
