import { Prisma } from "@/generated/prisma/browser";

export type MetadataWithIncludes = Prisma.MetadataGetPayload<{
  include: {
    attachments: true;
    authors: true;
    publishers: true;
  };
}>;
