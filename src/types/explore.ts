import type { Prisma } from "@prisma/client";

import type { ItemWithMetadata } from "@/types/items";

/** Owner summary attached to public explore results. */
export type ExploreOwner = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/** Shelf partielle sélectionnée par `/api/explore` pour les items publics. */
export type ExploreShelf = {
  id: string;
  name: string;
  color?: string | null;
  type?: string | null;
  cardFormat?: string | null;
};

/**
 * Item public renvoyé par `/api/explore?q=` : item présenté
 * (`presentItemFromStorage`, cf. ItemWithMetadata) + propriétaire + shelf
 * partielle.
 */
export type ExploreItem = Omit<ItemWithMetadata, "shelf"> & {
  shelf?: ExploreShelf | null;
  user?: ExploreOwner | null;
};

/** Étagère publique renvoyée par `/api/explore` sans query (include complet). */
export type ExplorePublicShelf = Prisma.ShelfGetPayload<{
  include: { _count: { select: { items: true } } };
}> & {
  user?: ExploreOwner | null;
};
