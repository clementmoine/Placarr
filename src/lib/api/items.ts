import axios from "axios";

import type { Prisma, Item, Condition } from "@prisma/client";
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
        currentShelfId?: string | null;
      })
    | (Prisma.ItemUpdateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
        shelfId?: string;
        currentShelfId?: string | null;
      }),
): Promise<ItemWithMetadata> => {
  const url = new URL("/api/items", window.location.origin);
  let method: "POST" | "PATCH" = "POST";
  const { currentShelfId, ...payload } = data;

  if ("id" in data && data.id) {
    url.searchParams.set("id", data.id.toString());
    if (currentShelfId) {
      url.searchParams.set("shelfId", currentShelfId);
    }
    method = "PATCH";
  }

  return axios({
    method,
    url: url.toString(),
    data: payload,
  }).then((response) => response.data);
};

export type SaveItemsBatchInput = {
  shelfId: string;
  names: string[];
  condition?: Condition;
};

export type SaveItemsBatchResult = {
  count: number;
};

export type MoveItemsBatchInput = {
  itemIds: string[];
  targetShelfId: string;
  sourceShelfId?: string;
};

export type MoveItemsBatchResult = {
  count: number;
  targetShelfId: string;
  sourceShelfIds: string[];
};

export const saveItemsBatch = (
  data: SaveItemsBatchInput,
): Promise<SaveItemsBatchResult> => {
  return axios
    .post("/api/items/batch", data)
    .then((response) => response.data);
};

export const moveItemsBatch = (
  data: MoveItemsBatchInput,
): Promise<MoveItemsBatchResult> => {
  return axios
    .patch("/api/items/batch", data)
    .then((response) => response.data);
};

export type RefreshItemsBatchInput = {
  itemIds: string[];
  sourceShelfId?: string;
};

export type RefreshItemsBatchResult = {
  count: number;
};

export const refreshItemsBatch = (
  data: RefreshItemsBatchInput,
): Promise<RefreshItemsBatchResult> => {
  return axios
    .put("/api/items/batch", data)
    .then((response) => response.data);
};

export const deleteItem = (id: Item["id"]): Promise<void> => {
  if (id == null) {
    throw new Error("Id was not given to deleteItem");
  }

  const url = new URL("/api/items", window.location.origin);
  url.searchParams.set("id", id.toString());

  return axios.delete(url.toString()).then(() => {});
};

export type GetItemsOptions = {
  excludeShelfTypes?: string[];
  shelfTypes?: string[];
};

export const getItems = (
  search?: string | null,
  shelfId?: string | null,
  options?: GetItemsOptions,
): Promise<ItemWithMetadata[]> => {
  const url = new URL("/api/items", window.location.origin);
  if (search && search.length >= 1) {
    url.searchParams.set("q", search);
  }
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }
  if (options?.excludeShelfTypes?.length) {
    url.searchParams.set(
      "excludeShelfTypes",
      options.excludeShelfTypes.join(","),
    );
  }
  if (options?.shelfTypes?.length) {
    url.searchParams.set("shelfTypes", options.shelfTypes.join(","));
  }
  return axios.get(url.toString()).then((response) => response.data);
};

export interface ItemPrices {
  priceNew: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  priceLastUpdated: string | null;
  priceSources?: string[];
  priceSourceDisplayNames?: string[];
  isReferencePriceOnly?: boolean;
  priceObservations?: Array<{
    source: string;
    productName?: string | null;
    merchantName?: string | null;
    condition?: string | null;
    priceCents: number;
    currency?: string | null;
    sourceUrl?: string | null;
    offerCount?: number | null;
    observedAt?: string | null;
    isReferencePriceSource?: boolean;
    sourceDisplayLabel?: string;
  }>;
}

export interface RefreshItemMetadataResponse {
  accepted?: boolean;
  metadataRefreshStartedAt?: string;
  metadata: ItemWithMetadata["metadata"] | null;
  item?: ItemWithMetadata | null;
}

export const getItemPrices = (
  itemId: string,
  shelfId?: string | null,
): Promise<ItemPrices> => {
  const url = new URL(`/api/items/${itemId}/prices`, window.location.origin);
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
  const url = new URL(`/api/items/${itemId}/metadata`, window.location.origin);
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }

  return axios
    .post(url.toString(), lookupQuery ? { lookupQuery } : {})
    .then((res) => res.data);
};
