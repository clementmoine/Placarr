import type { Prisma } from "@prisma/client";

export type ItemWithMetadata = Prisma.ItemGetPayload<{
  include: {
    metadata: {
      include: {
        attachments: true;
        authors: true;
        publishers: true;
      };
    };
  };
}>;
