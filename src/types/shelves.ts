import type { Prisma } from "@/generated/prisma/browser";

/** Cover + background of a shelf's highest-rated item, for the shelf card. */
export type ShelfBestItem = {
  imageUrl: string | null;
  backgroundImageUrl: string | null;
};

export type ShelfWithItemCount = Prisma.ShelfGetPayload<{
  include: {
    _count: { select: { items: true } };
  };
}> & {
  bestItem?: ShelfBestItem | null;
};

export type ShelfWithItems = Prisma.ShelfGetPayload<{
  include: { items: true };
}>;
