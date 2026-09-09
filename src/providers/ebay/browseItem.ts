import { httpGet, type JsonObject } from "@/lib/http/httpClient";

import { bestEbayCoverUrl } from "./coverUrl";
import {
  EBAY_REQUEST_TIMEOUT_MS,
  getEbayEnv,
  getEbayMarketplaceId,
  type EbayCredentials,
} from "./env";
import { getEbayBrowseAccessToken } from "./oauth";

export type EbayBrowseItem = {
  itemId: string;
  legacyItemId: string;
  title: string;
  itemWebUrl: string | null;
  imageUrls: string[];
};

/** Browse item id: `v1|{legacy}|{variation}`. Variation `0` when none. */
export function ebayBrowseItemId(
  legacyItemId: string,
  variationId = "0",
): string {
  return `v1|${legacyItemId.trim()}|${variationId.trim()}`;
}

export function parseEbayBrowseItemImages(data: JsonObject): string[] {
  const urls = new Set<string>();
  const push = (raw?: string | null) => {
    const upgraded = bestEbayCoverUrl(raw);
    if (upgraded) urls.add(upgraded);
  };
  const image = data.image;
  if (image && typeof image === "object" && "imageUrl" in image) {
    push(typeof image.imageUrl === "string" ? image.imageUrl : null);
  }
  const rows = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];
  for (const row of [
    ...rows(data.additionalImages),
    ...rows(data.thumbnailImages),
  ]) {
    if (row && typeof row === "object" && "imageUrl" in row) {
      push(typeof row.imageUrl === "string" ? row.imageUrl : null);
    }
  }
  return [...urls];
}

export function parseEbayBrowseItem(data: JsonObject): EbayBrowseItem | null {
  const itemId = String(data.itemId ?? "").trim();
  const legacyItemId = String(data.legacyItemId ?? "").trim();
  const title = String(data.title ?? "").trim();
  if (!itemId || !title) return null;
  return {
    itemId,
    legacyItemId,
    title,
    itemWebUrl:
      typeof data.itemWebUrl === "string" ? data.itemWebUrl.trim() : null,
    imageUrls: parseEbayBrowseItemImages(data),
  };
}

/**
 * Official Browse `getItem` — TOS-compliant listing read. No HTML scrape.
 */
export async function fetchEbayBrowseItem(
  itemId: string,
  options: {
    marketplaceId?: string;
    credentials?: EbayCredentials | null;
  } = {},
): Promise<EbayBrowseItem | null> {
  const credentials = options.credentials ?? getEbayEnv();
  if (!credentials) return null;
  const token = await getEbayBrowseAccessToken(credentials);
  if (!token) return null;
  const encoded = encodeURIComponent(itemId.trim());
  const res = await httpGet<JsonObject>(
    `https://api.ebay.com/buy/browse/v1/item/${encoded}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID":
          options.marketplaceId?.trim() || getEbayMarketplaceId(),
        Accept: "application/json",
      },
      timeout: EBAY_REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
    },
  );
  if (res.status !== 200 || !res.data || typeof res.data !== "object") {
    return null;
  }
  return parseEbayBrowseItem(res.data);
}
