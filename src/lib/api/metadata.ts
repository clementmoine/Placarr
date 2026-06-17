import axios from "axios";
import { MetadataWithIncludes } from "@/types/metadata";

export async function getMetadataPreview(
  name: string,
  type: string,
  barcode?: string | null,
  platform?: string | null,
): Promise<MetadataWithIncludes | null> {
  const { data } = await axios.get("/api/metadata", {
    params: {
      name,
      type,
      barcode,
      platform,
    },
  });
  return data;
}

export async function getMetadataSuggestions(
  name: string,
  type: string,
  platform?: string | null,
): Promise<string[]> {
  const { data } = await axios.get("/api/metadata", {
    params: {
      name,
      type,
      suggestions: "true",
      platform,
    },
  });
  return data;
}
