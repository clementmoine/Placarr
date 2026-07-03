import { remoteImageProxyProviderFor } from "@/lib/media/remoteProxy";
import { structuralCoverDownloadCandidates } from "@/lib/media/coverUrlUpgrades";
import { getProviderModule } from "@/services/provider/registry";

function mergeCoverDownloadCandidates(
  url: string,
  ...groups: Array<string[] | undefined>
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    ordered.push(value);
  };

  for (const group of groups) {
    for (const candidate of group ?? []) {
      push(candidate);
    }
  }

  push(url);
  return ordered;
}

/**
 * Ordered URL candidates to try when localizing a remote cover image.
 * Provider modules may expand aliases (CDN paths, slug variants, fallbacks).
 */
export function coverDownloadCandidates(url: string): string[] {
  if (!url || !url.startsWith("http")) return [url];

  const provider = remoteImageProxyProviderFor(url);
  const providerExpanded = provider
    ? getProviderModule(provider.id)?.expandCoverDownloadCandidates?.(url)
    : undefined;
  const structural = structuralCoverDownloadCandidates(url);

  return mergeCoverDownloadCandidates(url, providerExpanded, structural);
}
