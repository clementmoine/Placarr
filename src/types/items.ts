import type { Prisma } from "@prisma/client";

import type { ItemPrices } from "@/lib/api/items";

export type ItemWithMetadata = Prisma.ItemGetPayload<{
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
}> & {
  /** Present when API canonical title differs from the user-entered stored name. */
  storedName?: string;
} & Partial<ItemPrices>;
