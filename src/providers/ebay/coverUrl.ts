import { structuralCoverDownloadCandidates } from "@/core/enrich/media/coverUrlUpgrades";

/** eBay Browse / Catalog image URLs — prefer largest i.ebayimg.com rendition. */
export function ebayCoverDownloadCandidates(url: string): string[] {
  if (!/i\.ebayimg\.com/i.test(url)) return [url];
  return structuralCoverDownloadCandidates(url);
}

export function bestEbayCoverUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  return ebayCoverDownloadCandidates(url.trim())[0];
}
