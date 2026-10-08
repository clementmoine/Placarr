import { PROVIDERS } from "@/core/catalog/catalog";

/**
 * Resolve the registry provider that owns a protected CDN URL.
 * Looked up live (not module-cached) so HMR / late registry edits pick up
 * new `remoteImageReferer` hosts without a full server restart.
 */
export function remoteImageProxyProviderFor(url: string) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    PROVIDERS.find(
      (provider) =>
        Boolean(provider.remoteImageReferer) &&
        Boolean(provider.coverUrlHost) &&
        url.includes(provider.coverUrlHost as string),
    ) ?? null
  );
}

export function remoteImageRequestHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };

  const provider = remoteImageProxyProviderFor(url);
  if (provider?.remoteImageReferer) {
    headers.Referer = provider.remoteImageReferer;
  }

  return headers;
}
