import { remoteImageProxyProviderFor } from "@/lib/media/remoteProxy";
import { getProviderModule } from "@/services/provider/registry";

/**
 * Ordered URL candidates to try when localizing a remote cover image.
 * Provider modules may expand aliases (CDN paths, slug variants, fallbacks).
 */
export function coverDownloadCandidates(url: string): string[] {
  if (!url || !url.startsWith("http")) return [url];

  const provider = remoteImageProxyProviderFor(url);
  const expanded = provider
    ? getProviderModule(provider.id)?.expandCoverDownloadCandidates?.(url)
    : undefined;

  if (expanded?.length) return expanded;
  return [url];
}
