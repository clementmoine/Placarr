/**
 * Folding several copies of the same object into one tile.
 *
 * A collector who owns four of a card has four `Item` rows, and that is
 * deliberate: each carries its own condition, its own purchase price and its own
 * loan. A quantity column would force all three back per-unit, which is the
 * `Item` table rebuilt inside a JSON field. So the shelf keeps N rows and only
 * the *display* groups them.
 *
 * Nothing here is specific to cards. Two copies of a boxed game group the same
 * way, and the shelves that already hold duplicates benefit without a migration.
 */

/** The little a copy has to expose to be grouped. */
export type GroupableCopy = {
  id: string;
  metadataId?: string | null;
  /** The copy's own finish or edition. Part of the identity. */
  variant?: string | null;
  /** Not part of the identity — see {@link copyGroupKey}. */
  condition?: string | null;
  name?: string | null;
};

export type CopyGroup<T> = {
  /** Stable across renders: the key the copies were grouped on. */
  key: string;
  /** The copy the tile stands for — the first in the order it was given. */
  lead: T;
  /** Every copy, lead included, in the order they arrived. */
  copies: T[];
};

/**
 * What makes two copies the same object.
 *
 * Condition is deliberately absent. It describes the *health* of a copy, not
 * its identity, and it changes over time — a mint card gets played. If it split
 * groups, a collector could never be told "you have 3 Elsa", which is the one
 * thing grouping exists to say.
 *
 * The variant *is* in the key: a foil Elsa and a plain one are different
 * objects, priced differently and collected separately.
 *
 * A copy with no metadata falls back to its own id, so unidentified items stay
 * apart rather than piling into one anonymous heap.
 */
export function copyGroupKey(copy: GroupableCopy): string {
  if (!copy.metadataId) return `item:${copy.id}`;
  const variant = copy.variant?.trim().toLowerCase() ?? "";
  return `meta:${copy.metadataId}|${variant}`;
}

/**
 * Group copies while preserving the order they were given in.
 *
 * The caller has already sorted them, so a group appears where its first copy
 * did — regrouping must not quietly reorder a shelf.
 */
export function groupCopies<T extends GroupableCopy>(
  copies: readonly T[],
): CopyGroup<T>[] {
  const groups = new Map<string, CopyGroup<T>>();

  for (const copy of copies) {
    const key = copyGroupKey(copy);
    const existing = groups.get(key);
    if (existing) existing.copies.push(copy);
    else groups.set(key, { key, lead: copy, copies: [copy] });
  }

  return [...groups.values()];
}

/**
 * Strip the copy marker a duplicate's title carries.
 *
 * Duplicates were disambiguated by appending `(copie)` to the name. Once the
 * tile says `×3`, repeating it is noise — and on the lead copy it was always
 * arbitrary which of the four wore it.
 */
export function withoutCopyMarker(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/\s*\((?:copie|copy)(?:\s*\d+)?\)\s*$/i, "")
    .trim();
}
