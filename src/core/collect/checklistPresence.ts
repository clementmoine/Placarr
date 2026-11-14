/**
 * Presence → checklist ownership buckets.
 *
 * `past` must not inflate the owned set (buy advice / %). The same change
 * surfaces « déjà eu » so sold/discarded cards do not reappear as « à acheter ».
 * `away` is its own bucket (filterable in the UI) but still counts as in-hand
 * for completion. A legacy `wanted` row is read as `away`. Virtuals (closed
 * sealed) are covered for buy, not « en main ».
 */
import { ownershipSetFromPrintKey } from "@/core/collect/checklistOwnership";
import {
  countsAsOwned,
  isItemAway,
  isItemPast,
} from "@/core/collect/itemAbsence";

export type ChecklistCardPresence =
  | "owned"
  | "away"
  | "virtual"
  | "past"
  | "missing";

export type ChecklistPresenceItem = {
  printKey: string | null;
  setCode?: string | null;
  variant?: string | null;
  presence?: string | null;
};

export type ChecklistOwnershipBuckets = {
  /** Physically on the shelf (`owned`). */
  owned: Set<string>;
  /** Temporary absence — still in-hand for %, filterable in the UI. */
  away: Set<string>;
  /** Covered by a closed sealed product — buy exclusion, not in-hand. */
  virtual: Set<string>;
  /** `past` — déjà eu ; exclude from buy missing. */
  alreadyHad: Set<string>;
};

/**
 * Same key shape as {@link checklistSetOwnedKey} — kept local so this module
 * does not import `checklist.ts` (buildShelfChecklist imports us).
 */
function ownershipKey(
  item: ChecklistPresenceItem,
  masterSet: boolean,
): string | null {
  const printKey = item.printKey?.trim();
  if (!printKey) return null;
  const set = ownershipSetFromPrintKey(printKey, item.setCode)
    ?.trim()
    .toLowerCase();
  const pk = printKey.toLowerCase();
  if (!masterSet) {
    return set ? `${set}|${pk}` : pk;
  }
  const finish = (item.variant ?? "").trim().toLowerCase();
  const base = `${pk}|${finish}`;
  return set ? `${set}|${base}` : base;
}

/**
 * Partition shelf items into checklist key buckets. When the same key appears
 * under several presences, precedence is owned → away → past.
 * `virtual` is merged separately (from sealed derivation).
 */
export function partitionChecklistOwnership(
  items: readonly ChecklistPresenceItem[],
  options: {
    masterSet?: boolean;
    virtualKeys?: ReadonlySet<string>;
  } = {},
): ChecklistOwnershipBuckets {
  const masterSet = Boolean(options.masterSet);
  const owned = new Set<string>();
  const away = new Set<string>();
  const alreadyHad = new Set<string>();
  const virtual = new Set<string>(options.virtualKeys ?? []);

  for (const item of items) {
    const key = ownershipKey(item, masterSet);
    if (!key) continue;
    if (isItemAway(item)) away.add(key);
    else if (countsAsOwned(item)) owned.add(key);
    else if (isItemPast(item)) alreadyHad.add(key);
  }

  for (const key of owned) {
    away.delete(key);
    alreadyHad.delete(key);
    virtual.delete(key);
  }
  for (const key of away) {
    alreadyHad.delete(key);
    virtual.delete(key);
  }
  for (const key of alreadyHad) {
    virtual.delete(key);
  }

  return { owned, away, virtual, alreadyHad };
}

export function resolveChecklistCardPresence(
  print: { setId: string; printKey: string; finish?: string | null },
  buckets: {
    owned: ReadonlySet<string>;
    away: ReadonlySet<string>;
    virtual: ReadonlySet<string>;
    alreadyHad: ReadonlySet<string>;
  },
  masterSet: boolean,
  isOwned: (
    set: ReadonlySet<string>,
    print: { setId: string; printKey: string; finish?: string | null },
    masterSet: boolean,
  ) => boolean,
): ChecklistCardPresence {
  if (isOwned(buckets.owned, print, masterSet)) return "owned";
  if (isOwned(buckets.away, print, masterSet)) return "away";
  if (isOwned(buckets.alreadyHad, print, masterSet)) return "past";
  if (isOwned(buckets.virtual, print, masterSet)) return "virtual";
  return "missing";
}

/** Buy-plan / missing pool: not held, not virtual-covered, not « déjà eu ». */
export function checklistCardCountsAsMissing(
  presence: ChecklistCardPresence,
): boolean {
  return presence === "missing";
}

/** Counts toward « en main » completion (`owned` | `away`). */
export function checklistCardCountsAsInHand(
  presence: ChecklistCardPresence,
): boolean {
  return presence === "owned" || presence === "away";
}

/** Counts toward « tout possédé (scellé compris) ». */
export function checklistCardCountsAsCovered(
  presence: ChecklistCardPresence,
): boolean {
  return (
    presence === "owned" ||
    presence === "away" ||
    presence === "virtual"
  );
}
