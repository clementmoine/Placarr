import axios from "axios";

import type { Prisma, Item, Condition } from "@/generated/prisma/browser";
import type { ItemWithMetadata } from "@/types/items";
import type { MetadataResult } from "@/types/metadataProvider";

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

/** Open a sealed product — materialize guaranteed / pile contents (étapes 4–6). */
export const openSealedItem = (
  id: Item["id"],
  options?: {
    shelfId?: string | null;
    createShell?: boolean;
    childBoosterSlug?: string | null;
    packCount?: number | null;
    takeSealedCount?: number | null;
  },
): Promise<{
  item: ItemWithMetadata;
  childIds: string[];
  shellId: string | null;
  childCount: number;
  remainingSealed?: number;
  groupId: string;
}> => {
  const url = new URL(
    `/api/items/${encodeURIComponent(id)}/open`,
    window.location.origin,
  );
  if (options?.shelfId) {
    url.searchParams.set("shelfId", options.shelfId);
  }
  return axios
    .post(url.toString(), {
      createShell: Boolean(options?.createShell),
      ...(options?.childBoosterSlug
        ? { childBoosterSlug: options.childBoosterSlug }
        : {}),
      ...(options?.packCount != null ? { packCount: options.packCount } : {}),
      ...(options?.takeSealedCount != null
        ? { takeSealedCount: options.takeSealedCount }
        : {}),
    })
    .then((response) => response.data);
};

/** Presence / sealed audit timeline for an item. */
export const getItemEvents = (
  id: Item["id"],
  options?: { shelfId?: string | null },
): Promise<{
  itemId: string;
  events: Array<{
    id: string;
    at: string;
    fromPresence: string;
    toPresence: string;
    reason: string | null;
    kind: string;
    snapshot: Record<string, unknown> | null;
  }>;
}> => {
  const url = new URL(
    `/api/items/${encodeURIComponent(id)}/events`,
    window.location.origin,
  );
  if (options?.shelfId) {
    url.searchParams.set("shelfId", options.shelfId);
  }
  return axios.get(url.toString()).then((response) => response.data);
};

/** Current parent + remount candidates (décisions 8–9). */
export const getItemContainment = (
  id: Item["id"],
  options?: { shelfId?: string | null },
): Promise<{
  childId: string;
  childRef: { kind: "sealed"; slug: string; skuKey: string } | {
    kind: "card";
    printKey: string;
  } | null;
  currentParent: {
    id: string;
    name: string;
    skuKey: string | null;
    slug: string;
    linkId: string;
  } | null;
  candidates: Array<{
    id: string;
    name: string;
    skuKey: string;
    slots: number;
    attachedMatching: number;
    remaining: number;
  }>;
}> => {
  const url = new URL(
    `/api/items/${encodeURIComponent(id)}/containment`,
    window.location.origin,
  );
  if (options?.shelfId) {
    url.searchParams.set("shelfId", options.shelfId);
  }
  return axios.get(url.toString()).then((response) => response.data);
};

/** Remettre un item sous un scellé ouvert compatible. */
export const attachItemContainment = (
  id: Item["id"],
  options: { shelfId?: string | null; parentId: string },
): Promise<{ item: ItemWithMetadata; parentId: string }> => {
  const url = new URL(
    `/api/items/${encodeURIComponent(id)}/containment`,
    window.location.origin,
  );
  if (options.shelfId) {
    url.searchParams.set("shelfId", options.shelfId);
  }
  return axios
    .post(url.toString(), { parentId: options.parentId })
    .then((response) => response.data);
};

/** Retirer l'item de son contenant (lien content). */
export const detachItemContainment = (
  id: Item["id"],
  options?: { shelfId?: string | null },
): Promise<{ item: ItemWithMetadata; detachedFrom: string }> => {
  const url = new URL(
    `/api/items/${encodeURIComponent(id)}/containment`,
    window.location.origin,
  );
  if (options?.shelfId) {
    url.searchParams.set("shelfId", options.shelfId);
  }
  return axios.delete(url.toString()).then((response) => response.data);
};

/** Declare pulls from a sealed product (grouped / unit rip — étape 6). */
export const declareSealedPulls = (
  id: Item["id"],
  options: {
    shelfId?: string | null;
    prints: readonly {
      printKey: string;
      name?: string | null;
      language?: string | null;
    }[];
  },
): Promise<{
  item: ItemWithMetadata;
  childIds: string[];
  childCount: number;
  groupId: string;
}> => {
  const url = new URL(
    `/api/items/${encodeURIComponent(id)}/declare`,
    window.location.origin,
  );
  if (options.shelfId) {
    url.searchParams.set("shelfId", options.shelfId);
  }
  return axios
    .post(url.toString(), { prints: options.prints })
    .then((response) => response.data);
};

export const saveItem = (
  data:
    | (Prisma.ItemCreateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
        currentShelfId?: string | null;
        metadataPreview?: MetadataResult | null;
      })
    | (Prisma.ItemUpdateInput & {
        refreshMetadata?: boolean;
        lookupQuery?: string;
        shelfId?: string;
        currentShelfId?: string | null;
        metadataPreview?: MetadataResult | null;
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
  return axios.post("/api/items/batch", data).then((response) => response.data);
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
  return axios.put("/api/items/batch", data).then((response) => response.data);
};

export type DeleteItemsBatchInput = {
  itemIds: string[];
  sourceShelfId?: string;
};

export type DeleteItemsBatchResult = {
  count: number;
  sourceShelfIds: string[];
};

export const deleteItemsBatch = (
  data: DeleteItemsBatchInput,
): Promise<DeleteItemsBatchResult> => {
  return axios
    .delete("/api/items/batch", { data })
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
  priceFoil?: number | null;
  priceUsed: number | null;
  priceUsedCIB: number | null;
  /** Point price derived from catalog estimates — display fallback, shown as ~. */
  priceEstimated?: number | null;
  /** FX ~ for the foil market bucket (TCG finishes). */
  priceEstimatedFoil?: number | null;
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
    metadataScoped?: boolean;
    catalogEstimateMinCents?: number;
    catalogEstimateMaxCents?: number;
    catalogEstimateDisplayValue?: string;
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

export type SealedContainmentSourceDto = {
  slug: string;
  name: string;
  kind: string;
  imageUrl?: string | null;
  relation: "guaranteed" | "listed_pool" | "set_pool";
};

export const getItemSealedContainment = (
  shelfId: string,
  itemId: string,
): Promise<{ sources: SealedContainmentSourceDto[] }> => {
  const url = new URL(
    `/api/shelves/${encodeURIComponent(shelfId)}/items/${encodeURIComponent(itemId)}/sealed-containment`,
    window.location.origin,
  );
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

export type RemoveItemMediaImageResponse = {
  removedAttachmentIds: string[];
  clearedCover: boolean;
  clearedBackground: boolean;
  nextImageUrl: string | null;
  nextBackgroundImageUrl: string | null;
  item: ItemWithMetadata | null;
};

/** Drop one gallery image; catalogue sync may recreate provider rows later. */
export const removeItemMediaImage = (
  itemId: string,
  imageUrl: string,
  shelfId?: string | null,
): Promise<RemoveItemMediaImageResponse> => {
  const url = new URL(`/api/items/${itemId}/media`, window.location.origin);
  if (shelfId) {
    url.searchParams.set("shelfId", shelfId);
  }
  return axios
    .delete(url.toString(), { data: { url: imageUrl } })
    .then((res) => res.data);
};
