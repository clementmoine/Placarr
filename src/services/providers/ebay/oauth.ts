import axios from "axios";

import {
  EBAY_BROWSE_OAUTH_SCOPE,
  EBAY_CATALOG_OAUTH_SCOPE,
  EBAY_OAUTH_SCOPES,
  EBAY_OAUTH_URL,
  EBAY_REQUEST_TIMEOUT_MS,
  type EbayCredentials,
} from "./env";

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Test helper: forget cached OAuth tokens so each case re-authenticates. */
export function resetEbayTokenCache() {
  tokenCache.clear();
}

async function requestEbayAccessToken(
  credentials: EbayCredentials,
  scope: string,
): Promise<string | null> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const basic = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
  ).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope,
  });
  const res = await axios.post(EBAY_OAUTH_URL, body.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: EBAY_REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });
  const token =
    res.status === 200 ? (res.data?.access_token as string | undefined) : undefined;
  if (!token) return null;

  const expiresInSec = Number(res.data?.expires_in) || 7200;
  tokenCache.set(scope, { token, expiresAt: Date.now() + expiresInSec * 1000 });
  return token;
}

/** Browse API token — always requested with the base application scope. */
export async function getEbayBrowseAccessToken(
  credentials: EbayCredentials,
): Promise<string | null> {
  return requestEbayAccessToken(credentials, EBAY_BROWSE_OAUTH_SCOPE);
}

/**
 * Catalog API token. Tries Browse+Catalog scopes first, then Catalog-only, so
 * apps without the Catalog scope enabled keep Browse working unchanged.
 */
export async function getEbayCatalogAccessToken(
  credentials: EbayCredentials,
): Promise<string | null> {
  const combined = await requestEbayAccessToken(credentials, EBAY_OAUTH_SCOPES);
  if (combined) return combined;
  return requestEbayAccessToken(credentials, EBAY_CATALOG_OAUTH_SCOPE);
}

/** Health ping: any working application token is enough. */
export async function getEbayAccessToken(
  credentials: EbayCredentials,
): Promise<string | null> {
  return getEbayBrowseAccessToken(credentials);
}
