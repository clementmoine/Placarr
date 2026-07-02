/**
 * eBay Browse API credentials and endpoints. The official, TOS-compliant way to
 * read eBay listing data (PicClick is just a visual reskin of eBay and forbids
 * scraping). Browse uses an OAuth client-credentials (application) token.
 */
export const EBAY_ENV_NAMES = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"] as const;

export const EBAY_OAUTH_URL =
  "https://api.ebay.com/identity/v1/oauth2/token";

/** Browse (listings) application scope. */
export const EBAY_BROWSE_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";

/** Catalog API read scope — must be enabled on the eBay developer app. */
export const EBAY_CATALOG_OAUTH_SCOPE =
  "https://api.ebay.com/oauth/api_scope/commerce.catalog.readonly";

/** Preferred token request when both APIs are enabled on the app. */
export const EBAY_OAUTH_SCOPES = [
  EBAY_BROWSE_OAUTH_SCOPE,
  EBAY_CATALOG_OAUTH_SCOPE,
].join(" ");

export const EBAY_BROWSE_SEARCH_URL =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

export const EBAY_CATALOG_SEARCH_URL =
  "https://api.ebay.com/commerce/catalog/v1_beta/product_summary/search";

export const EBAY_REQUEST_TIMEOUT_MS = 6000;

/** eBay marketplace the Browse search runs against (prices/currency follow it). */
export function getEbayMarketplaceId(): string {
  return process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_FR";
}

export type EbayCredentials = {
  clientId: string;
  clientSecret: string;
};

export function getEbayEnv(): EbayCredentials | null {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
