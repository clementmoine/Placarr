import axios from "axios";

import type { Prisma, Item } from "@prisma/client";
import type { ItemWithMetadata } from "@/types/items";

export const getItem = (
  id?: Item["id"],
  shelfId?: string | null,
): Promise<ItemWithMetadata> => {
  if (id == null) {
    throw new Error("Id was not given to getItem");
  }

  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id);
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }

  return axios.get(url.toString()).then((response) => response.data);
};

export const saveItem = (
  data:
    | (Prisma.ItemCreateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
      })
    | (Prisma.ItemUpdateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
        shelfId?: string;
      }),
): Promise<ItemWithMetadata> => {
  const url = new URL("/api/items", window.location.origin);
  let method: "POST" | "PATCH" = "POST";

  if ("id" in data && data.id) {
    url.searchParams.set("id", data.id.toString());
    method = "PATCH";
  }

  return axios({
    method,
    url: url.toString(),
    data,
  }).then((response) => response.data);
};

export const deleteItem = (id: Item["id"]): Promise<void> => {
  if (id == null) {
    throw new Error("Id was not given to deleteItem");
  }

  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id.toString());

  return axios.delete(url.toString()).then(() => {});
};

export const getItems = (
  search?: string | null,
  shelfId?: string | null,
): Promise<ItemWithMetadata[]> => {
  const url = new URL("/api/items", window.location.origin);
  if (search && search.length >= 1) {
    url.searchParams.set("q", search);
  }
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }
  return axios.get(url.toString()).then((response) => response.data);
};

export interface ItemPrices {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: string | null;
}

export interface RefreshItemMetadataResponse {
  metadata: ItemWithMetadata["metadata"] | null;
  item?: ItemWithMetadata | null;
}

export const getItemPrices = (
  itemId: string,
  shelfId?: string | null,
): Promise<ItemPrices> => {
  const url = new URL(
    `/api/items/${itemId}/prices`,
    window.location.origin,
  );
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }
  return axios.get(url.toString()).then((res) => res.data);
};

export const refreshItemMetadata = (
  itemId: string,
  shelfId?: string | null,
  lookupQuery?: string | null,
): Promise<RefreshItemMetadataResponse> => {
  const url = new URL(
    `/api/items/${itemId}/metadata`,
    window.location.origin,
  );
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }

  return axios
    .post(url.toString(), lookupQuery ? { lookupQuery } : {})
    .then((res) => res.data);
};
