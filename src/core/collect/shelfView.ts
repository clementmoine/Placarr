import {
  coerceItemPresence,
  countsAsOwned,
  type ItemPresence,
} from "@/core/collect/itemAbsence";

/**
 * Shelf grid view — replaces the old « doublons seulement » toggle.
 * Default {@link DEFAULT_ITEM_COLLECTION_SHELF_VIEW} (« Toute la collection »)
 * applies no presence filter. `all` is the same view, kept for old URLs.
 * `duplicates` still limits itself to owned + temporarily away.
 */
export const ITEM_COLLECTION_SHELF_VIEWS = [
  "active",
  "away",
  "past",
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
  if (value === "all") return DEFAULT_ITEM_COLLECTION_SHELF_VIEW;
  // Old bookmarks for the removed « recherché » view land on absents.
  if (value === "wanted") return "away";
  if (isItemCollectionShelfView(value)) return value;
  return DEFAULT_ITEM_COLLECTION_SHELF_VIEW;
}

type PresenceFields = {
  presence?: ItemPresence | string | null;
};

function itemPresence(item: PresenceFields): ItemPresence {
  return coerceItemPresence(item.presence);
}

/**
 * Whether a physical item belongs in the chosen shelf view.
 * `active` keeps every presence. `duplicates` stays on owned + away,
 * then groups are filtered.
 */
export function itemMatchesShelfView(
  item: PresenceFields,
  view: ItemCollectionShelfView,
): boolean {
  const presence = itemPresence(item);
  switch (view) {
    case "active":
      return true;
    case "duplicates":
      return countsAsOwned({ presence });
    case "away":
      return presence === "away";
    case "past":
      return presence === "past";
  }
}

export function filterItemsByShelfView<T extends PresenceFields>(
  items: readonly T[],
  view: ItemCollectionShelfView,
): T[] {
  return items.filter((item) => itemMatchesShelfView(item, view));
}
