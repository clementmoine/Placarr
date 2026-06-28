import { retailerCatalogSharesRequestedIdentity } from "@/lib/retailer/titleMatch";

function coverSlugFromUrl(coverUrl: string): string {
  const pathname = coverUrl.split("?")[0]?.split("#")[0] ?? "";
  const filename = pathname.split("/").pop() ?? "";
  return decodeURIComponent(filename.replace(/\.[^.]+$/, ""))
    .replace(/[_-]+/g, " ")
    .replace(/\s+\d{6,}$/, "")
    .trim();
}

/** Rejects marketplace logos and cover filenames that belong to another product. */
export function isRetailerCoverUrlAlignedWithTitle(
  coverUrl: string,
  catalogTitle: string,
): boolean {
  const lowerUrl = coverUrl.toLowerCase();
  if (lowerUrl.includes("achatmoinscher.com/img/")) return false;

  const slug = coverSlugFromUrl(coverUrl);
  if (!slug || slug.length < 4) return true;

  return retailerCatalogSharesRequestedIdentity(catalogTitle, slug);
}
