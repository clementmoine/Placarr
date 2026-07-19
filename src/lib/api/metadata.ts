import axios, { isAxiosError } from "axios";
import type { MetadataResult } from "@/types/metadataProvider";

/** Cap interactive preview so Flare fan-out cannot hang the UI indefinitely. */
const METADATA_PREVIEW_TIMEOUT_MS = 45_000;

type MetadataLookupParams = {
  name: string;
  type: string;
  barcode?: string | null;
  platform?: string | null;
  shelfName?: string | null;
};

function metadataQueryParams({
  name,
  type,
  barcode,
  platform,
  shelfName,
}: MetadataLookupParams): Record<string, string> {
  const params: Record<string, string> = { name, type };
  if (barcode) params.barcode = barcode;
  if (platform) params.platform = platform;
  if (shelfName) params.shelfName = shelfName;
  return params;
}

function isTransientNetworkFailure(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  return (
    !error.response &&
    (error.code === "ECONNABORTED" ||
      error.code === "ERR_NETWORK" ||
      error.message === "Network Error")
  );
}

export async function getMetadataPreview(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  shelfName?: string | null,
): Promise<MetadataResult | null> {
  try {
    const { data } = await axios.get("/api/metadata", {
      params: metadataQueryParams({
        name,
        type,
        barcode,
        platform,
        shelfName,
      }),
      timeout: METADATA_PREVIEW_TIMEOUT_MS,
    });
    return data;
  } catch (error) {
    if (isTransientNetworkFailure(error)) return null;
    throw error;
  }
}

export async function getMetadataSuggestions(
  name: string,
  type: string,
  platform?: string | null,
  shelfName?: string | null,
): Promise<string[]> {
  try {
    const { data } = await axios.get("/api/metadata", {
      params: {
        ...metadataQueryParams({
          name,
          type,
          platform,
          shelfName,
        }),
        suggestions: "true",
      },
      timeout: METADATA_PREVIEW_TIMEOUT_MS,
    });
    return data;
  } catch (error) {
    if (isTransientNetworkFailure(error)) return [];
    throw error;
  }
}
