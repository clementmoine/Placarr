import type { MetadataResult } from "@/services/metadata";

export type MetadataAdapterContext = {
  name: string;
  barcode?: string | null;
  platform?: string | null;
  includePcSources?: boolean;
};

export interface MetadataProviderAdapter {
  id: string;
  resolve(ctx: MetadataAdapterContext): Promise<MetadataResult | null>;
}
