import type { Condition } from "@/generated/prisma/browser";

import { isBarcodePlaceholderItemName } from "@/core/collect/placeholderName";
import {
  filterMetadataForShelfPlatform,
  getCoverImage,
  isExplicitUserCoverOverride,
} from "@/core/collect/media";
import { collectMetadataTitleSuggestions } from "@/core/collect/titleSuggestions";
import type { ItemWithMetadata } from "@/types/items";
import type { MetadataResult } from "@/types/metadataProvider";

export type ItemModalFormValues = {
  shelfId: string;
  name: string;
  barcode?: string;
  description?: string;
  /**
   * Which variant of the object this copy is (a card's finish, say). Free text
   * because the vocabulary is the provider's; the options come from the
   * metadata's `variant-option` facts. See `@/core/enrich/variants`.
   */
  variant?: string | null;
  condition: Condition;
  imageUrl: string | File | null;
  backgroundImageUrl: string | File | null;
};

export type ItemModalShelfMediaContext = {
  type?: string;
  name?: string;
};

export type ItemModalPrefilledValues = {
  name?: string;
  barcode?: string;
  imageUrl?: string | null;
  shelfId?: string;
  metadataPreview?: MetadataResult | null;
};

export type ItemModalSessionInit = {
  formValues: ItemModalFormValues;
  suggestions: string[];
  nameSuggestion: string | null;
  fetchedMetadata: MetadataResult | null;
  lastInitializedShelfId: string;
  asyncInit:
    | { kind: "barcode"; barcode: string }
    | { kind: "preview"; name: string }
    | null;
};

type ItemModalSessionKeyInput = {
  isOpen: boolean;
  itemId?: string;
  item?: ItemWithMetadata | null;
  prefilledValues?: ItemModalPrefilledValues;
  shelfId: string;
};

export function itemModalSessionKey({
  isOpen,
  itemId,
  item,
  prefilledValues,
  shelfId,
}: ItemModalSessionKeyInput): string | null {
  if (!isOpen) return null;
  if (itemId) {
    // Wait until the item query has resolved, then keep one stable session for
    // the whole edit. Do not key on metadata.lastFetched — enrich completion
    // would re-bootstrap and wipe in-progress form edits (e.g. shelf moves).
    if (!item) return null;
    return `edit:${itemId}`;
  }

  const prefilledShelfId = prefilledValues?.shelfId ?? shelfId;
  return `new:${prefilledValues?.barcode ?? ""}|${prefilledValues?.name ?? ""}|${prefilledShelfId}`;
}

function defaultFormValues(
  shelfId: string,
  prefilledValues?: ItemModalPrefilledValues,
): ItemModalFormValues {
  return {
    shelfId: prefilledValues?.shelfId || shelfId || "",
    name: prefilledValues?.name || "",
    imageUrl: prefilledValues?.imageUrl || null,
    backgroundImageUrl: null,
    description: "",
    barcode: prefilledValues?.barcode || "",
    variant: null,
    condition: "used",
  };
}

function backgroundFromMetadata(metadata: MetadataResult | null | undefined) {
  if (!metadata?.attachments?.length) return null;
  const bgAttachment =
    metadata.attachments.find(
      (attachment) => attachment.type === "background",
    ) ||
    metadata.attachments.find(
      (attachment) => attachment.type === "screenshot",
    ) ||
    metadata.attachments.find((attachment) => attachment.type === "artwork");
  return bgAttachment?.url ?? null;
}

function formValuesFromMetadataPreview(
  base: ItemModalFormValues,
  metadata: MetadataResult,
  barcodeContext?: string,
): ItemModalFormValues {
  const next = { ...base };
  const currentBarcode = (barcodeContext || base.barcode || "").trim();
  if (metadata.barcode && !currentBarcode) {
    next.barcode = metadata.barcode;
  }
  if (metadata.description?.trim()) {
    next.description = metadata.description.trim();
  }
  if (metadata.imageUrl) {
    next.imageUrl = metadata.imageUrl;
  }
  const background = backgroundFromMetadata(metadata);
  if (background) {
    next.backgroundImageUrl = background;
  }
  return next;
}

export function buildItemModalSessionInit(input: {
  item?: ItemWithMetadata | null;
  prefilledValues?: ItemModalPrefilledValues;
  shelfId: string;
  activeShelfForMedia: ItemModalShelfMediaContext;
}): ItemModalSessionInit {
  const { item, prefilledValues, shelfId, activeShelfForMedia } = input;
  const defaults = defaultFormValues(shelfId, prefilledValues);

  if (item) {
    const storedName = (item.storedName || item.name || defaults.name).trim();
    const mediaForCover = {
      imageUrl: item.imageUrl,
      updatedAt: item.updatedAt,
      condition: item.condition,
      metadata: item.metadata,
      shelf: item.shelf || activeShelfForMedia,
    };
    // Without an explicit user gallery pick, seed the form on the dynamic
    // default (same ranking as cards / "Par défaut") — not a stale item.imageUrl.
    const seededCoverUrl = isExplicitUserCoverOverride(mediaForCover)
      ? item.imageUrl || defaults.imageUrl
      : getCoverImage(mediaForCover) || item.imageUrl || defaults.imageUrl;
    let formValues: ItemModalFormValues = {
      shelfId: item.shelfId || defaults.shelfId,
      name: storedName,
      description:
        item.description || item.metadata?.description || defaults.description,
      condition: item.condition || defaults.condition,
      variant: item.variant ?? defaults.variant ?? null,
      imageUrl: seededCoverUrl,
      backgroundImageUrl:
        item.backgroundImageUrl || defaults.backgroundImageUrl,
      barcode: item.barcode || defaults.barcode,
    };

    const metadata = filterMetadataForShelfPlatform(
      item.metadata || null,
      item.shelf || activeShelfForMedia,
    );
    const titleSuggestions = metadata
      ? collectMetadataTitleSuggestions(metadata, {
          itemName: storedName,
          barcode: item.barcode,
        })
      : [];

    if (
      metadata &&
      titleSuggestions.length > 0 &&
      isBarcodePlaceholderItemName(storedName, item.barcode)
    ) {
      formValues = { ...formValues, name: titleSuggestions[0] };
    }

    return {
      formValues,
      suggestions: titleSuggestions,
      nameSuggestion: titleSuggestions[0] ?? null,
      fetchedMetadata: metadata ?? null,
      lastInitializedShelfId: formValues.shelfId,
      asyncInit:
        !metadata && item.barcode?.trim()
          ? { kind: "barcode", barcode: item.barcode.trim() }
          : null,
    };
  }

  const prefilledMetadata = prefilledValues?.metadataPreview ?? null;
  let formValues = defaults;
  let fetchedMetadata: MetadataResult | null = null;

  if (prefilledMetadata) {
    fetchedMetadata =
      filterMetadataForShelfPlatform(prefilledMetadata, activeShelfForMedia) ??
      prefilledMetadata;
    formValues = formValuesFromMetadataPreview(
      formValues,
      fetchedMetadata,
      prefilledValues?.barcode,
    );
  }

  const suggestions = prefilledValues?.name ? [prefilledValues.name] : [];
  let asyncInit: ItemModalSessionInit["asyncInit"] = null;

  if (
    !prefilledMetadata &&
    (prefilledValues?.barcode || prefilledValues?.name)
  ) {
    if (prefilledValues.barcode?.trim()) {
      asyncInit = { kind: "barcode", barcode: prefilledValues.barcode.trim() };
    } else if (prefilledValues.name?.trim()) {
      asyncInit = { kind: "preview", name: prefilledValues.name.trim() };
    }
  }

  return {
    formValues,
    suggestions,
    nameSuggestion: prefilledValues?.name ?? null,
    fetchedMetadata,
    lastInitializedShelfId: formValues.shelfId,
    asyncInit,
  };
}
