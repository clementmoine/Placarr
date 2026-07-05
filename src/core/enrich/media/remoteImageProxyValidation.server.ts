import { remoteImageProxyProviderFor } from "@/core/enrich/media/remoteProxy";

const BLOCKED_PROXY_HOSTS =
  /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$|^(10\.|192\.168\.|169\.254\.)/i;

/** Server-side allowlist for `/api/media/remote` (registry-backed). */
export function isAllowedRemoteImageProxyTarget(url: string): boolean {
  if (!url || !remoteImageProxyProviderFor(url)) return false;
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
