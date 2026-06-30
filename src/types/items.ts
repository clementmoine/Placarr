import type { Prisma } from "@prisma/client";

import type { ItemPrices } from "@/lib/api/items";

export type ItemWithMetadata = Omit<
  Prisma.ItemGetPayload<{
    include: {
      shelf: true;
      metadata: {
        include: {
          attachments: true;
          authors: true;
          publishers: true;
        };
      };
    };
  }>,
  "priceNew" | "priceUsed" | "priceUsedCIB" | "priceLastUpdated"
> & {
  /** Present when API canonical title differs from the user-entered stored name. */
  storedName?: string;
  /** External reference-catalog URL when a provider declares one for this item. */
  referenceCatalogLink?: {
    url: string;
    isDirect?: boolean;
    providerLabel?: string;
  } | null;
} & Partial<ItemPrices>;
