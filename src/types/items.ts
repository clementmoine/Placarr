import type { Prisma } from "@prisma/client";

import type { ItemPrices } from "@/lib/api/items";
import type { MetadataResult } from "@/types/metadataProvider";

export type ItemWithMetadata = Omit<
  Prisma.ItemGetPayload<{
    include: {
      shelf: true;
    };
  }>,
  "priceNew" | "priceUsed" | "priceUsedCIB" | "priceLastUpdated"
> & {
  /**
   * Metadata telle que servie par l'API : `presentItemFromStorage` formate la
   * ligne Prisma en `MetadataResult` (aliases/facts JSON parsés, traits
   * provider stampés côté serveur, sourceType/sourceQuery non exposés).
   */
  metadata: MetadataResult | null;
  /** Present when API canonical title differs from the user-entered stored name. */
  storedName?: string;
  /** External reference-catalog URL when a provider declares one for this item. */
  referenceCatalogLink?: {
    url: string;
    isDirect?: boolean;
    providerLabel?: string;
  } | null;
} & Partial<ItemPrices>;
