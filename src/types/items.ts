import type { Prisma } from "@prisma/client";

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
}>;
