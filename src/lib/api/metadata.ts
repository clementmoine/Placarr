import axios from "axios";
import type { MetadataResult } from "@/types/metadataProvider";

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

export async function getMetadataPreview(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
  shelfName?: string | null,
): Promise<MetadataResult | null> {
  const { data } = await axios.get("/api/metadata", {
    params: metadataQueryParams({
      name,
      type,
      barcode,
      platform,
      shelfName,
    }),
  });
  return data;
}

export async function getMetadataSuggestions(
  name: string,
  type: string,
  platform?: string | null,
  shelfName?: string | null,
): Promise<string[]> {
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
  });
  return data;
}
