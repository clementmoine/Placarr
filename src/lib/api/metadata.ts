import axios from "axios";
import { MetadataWithIncludes } from "@/types/metadata";

export async function getMetadataPreview(
  name: string,
  type: string,
  barcode?: string | null,
): Promise<MetadataWithIncludes | null> {
  const { data } = await axios.get("/api/metadata", {
    params: {
      name,
      type,
      barcode,
    },
  });
  return data;
}
