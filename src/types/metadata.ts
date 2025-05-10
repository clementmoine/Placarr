import { Prisma } from "@prisma/client";

export type MetadataWithIncludes = Prisma.MetadataGetPayload<{
  include: {
    attachments: true;
    authors: true;
    publishers: true;
  };
}>;
