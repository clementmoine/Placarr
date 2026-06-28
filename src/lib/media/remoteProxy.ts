import { PROVIDERS } from "@/services/provider/registry";

const PROXY_PROVIDERS = PROVIDERS.filter(
  (provider) => provider.remoteImageReferer && provider.coverUrlHost,
);

export function remoteImageProxyProviderFor(url: string) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    PROXY_PROVIDERS.find(
      (provider) =>
        provider.coverUrlHost && url.includes(provider.coverUrlHost),
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
