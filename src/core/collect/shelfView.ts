import {
  countsAsOwned,
  isItemPresence,
  type ItemPresence,
} from "@/core/collect/itemAbsence";

/**
 * Shelf grid view — replaces the old « doublons seulement » toggle.
 * Default {@link DEFAULT_ITEM_COLLECTION_SHELF_VIEW} hides `past` / `wanted`
 * (plan: active shelf = owned + away).
 */
export const ITEM_COLLECTION_SHELF_VIEWS = [
  "active",
  "away",
  "wanted",
  "past",
  "all",
  "duplicates",
] as const;

export type ItemCollectionShelfView =
  (typeof ITEM_COLLECTION_SHELF_VIEWS)[number];

export const DEFAULT_ITEM_COLLECTION_SHELF_VIEW: ItemCollectionShelfView =
  "active";

const SHELF_VIEW_SET = new Set<string>(ITEM_COLLECTION_SHELF_VIEWS);

export function isItemCollectionShelfView(
  value: unknown,
): value is ItemCollectionShelfView {
  return typeof value === "string" && SHELF_VIEW_SET.has(value);
}

export function parseItemCollectionShelfView(
  value: string | null | undefined,
): ItemCollectionShelfView {
  if (isItemCollectionShelfView(value)) return value;
  return DEFAULT_ITEM_COLLECTION_SHELF_VIEW;
}

type PresenceFields = {
  presence?: ItemPresence | string | null;
};

function itemPresence(item: PresenceFields): ItemPresence {
  return isItemPresence(item.presence) ? item.presence : "owned";
}

/**
 * Whether a physical item belongs in the chosen shelf view.
 * `duplicates` uses the same membership as `active` (filter groups later).
 */
export function itemMatchesShelfView(
  item: PresenceFields,
  view: ItemCollectionShelfView,
): boolean {
  const presence = itemPresence(item);
  switch (view) {
    case "active":
    case "duplicates":
      return countsAsOwned({ presence });
    case "away":
      return presence === "away";
    case "wanted":
      return presence === "wanted";
    case "past":
      return presence === "past";
    case "all":
      return true;
  }
}

export function filterItemsByShelfView<T extends PresenceFields>(
  items: readonly T[],
  view: ItemCollectionShelfView,
): T[] {
  return items.filter((item) => itemMatchesShelfView(item, view));
}
