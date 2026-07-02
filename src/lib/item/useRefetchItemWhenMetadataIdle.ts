import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Item, Shelf } from "@prisma/client";

import { isItemMetadataBusy } from "@/lib/item/enrichment";
import { refetchItemQueries } from "@/lib/item/queryCache";

type ItemMetadataIdleFields = {
  id?: Item["id"];
  shelfId?: Item["shelfId"] | null;
  metadataId?: string | null;
  createdAt?: string | Date | null;
  metadataRefreshStartedAt?: string | Date | null;
};

export type { ItemMetadataIdleFields };

/**
 * When a background metadata refresh finishes, React Query stops polling but may
 * still hold the last in-flight snapshot. Refetch once so open modals and the
 * detail page see the persisted metadata/attachments.
 */
export function useRefetchItemWhenMetadataIdle(
  queryClient: QueryClient,
  item: ItemMetadataIdleFields | null | undefined,
  shelfId?: Shelf["id"] | null,
) {
  const wasBusyRef = useRef(false);

  useEffect(() => {
    const busy = isItemMetadataBusy(item);
    if (wasBusyRef.current && !busy && item?.id) {
      void refetchItemQueries(queryClient, item.id, [shelfId, item.shelfId]);
    }
    wasBusyRef.current = busy;
  }, [item, queryClient, shelfId]);
}

export function useRefetchShelfItemsWhenMetadataIdle(
  queryClient: QueryClient,
  items: ItemMetadataIdleFields[] | null | undefined,
  shelfId?: Shelf["id"] | null,
) {
  const wasBusyByItemRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!items?.length) return;

    for (const entry of items) {
      if (!entry.id) continue;
      const busy = isItemMetadataBusy(entry);
      const wasBusy = wasBusyByItemRef.current.get(entry.id) ?? false;
      if (wasBusy && !busy) {
        void refetchItemQueries(queryClient, entry.id, [shelfId, entry.shelfId]);
      }
      wasBusyByItemRef.current.set(entry.id, busy);
    }
  }, [items, queryClient, shelfId]);
}
