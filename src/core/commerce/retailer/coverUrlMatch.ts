import { retailerCatalogSharesRequestedIdentity } from "@/core/commerce/retailer/titleMatch";

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

  // Content-addressed catalog CDNs (PriceCharting) put no product identity in
  // the path — hashing them against the title would drop every honest cover.
  if (/images\.pricecharting\.com/i.test(lowerUrl)) return true;

  const slug = coverSlugFromUrl(coverUrl);
  if (!slug || slug.length < 4) return true;
  if (/^[a-f0-9]{16,}$/i.test(slug.replace(/\s+/g, ""))) return true;

  return retailerCatalogSharesRequestedIdentity(catalogTitle, slug);
}
