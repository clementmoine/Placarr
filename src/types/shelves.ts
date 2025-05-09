import type { Prisma } from "@prisma/client";

export type ShelfWithItemCount = Prisma.ShelfGetPayload<{
  include: {
    _count: true;
  };
}>;

export type ShelfWithItems = Prisma.ShelfGetPayload<{
  include: { items: true };
}>;
