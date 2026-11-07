/**
 * Presence → checklist ownership buckets.
 *
 * `past` and `wanted` must not inflate the owned set (buy advice / %). The
 * same change surfaces « déjà eu » so sold/discarded cards do not reappear as
 * « à acheter ». Virtuals (closed sealed) are a separate bucket — covered for
 * buy, not « en main ».
 */
import { ownershipSetFromPrintKey } from "@/core/collect/checklistOwnership";
import {
  countsAsOwned,
  isItemPast,
  isItemWanted,
} from "@/core/collect/itemAbsence";
import type { ItemPresence } from "@/generated/prisma/browser";

export type ChecklistCardPresence =
  | "owned"
  | "virtual"
  | "past"
  | "wanted"
  | "missing";

export type ChecklistPresenceItem = {
  printKey: string | null;
  setCode?: string | null;
  variant?: string | null;
  presence?: ItemPresence | null;
};

export type ChecklistOwnershipBuckets = {
  /** `owned` | `away` — counts for in-hand completion and buy exclusion. */
  owned: Set<string>;
  /** Covered by a closed sealed product — buy exclusion, not in-hand. */
  virtual: Set<string>;
  /** `past` — déjà eu ; exclude from buy missing. */
  alreadyHad: Set<string>;
  /** `wanted` — seeking ; still in buy missing, intermediate checkbox. */
  wanted: Set<string>;
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
 * under several presences, precedence is owned → past → wanted.
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
  const alreadyHad = new Set<string>();
  const wanted = new Set<string>();
  const virtual = new Set<string>(options.virtualKeys ?? []);

  for (const item of items) {
    const key = ownershipKey(item, masterSet);
    if (!key) continue;
    if (countsAsOwned(item)) owned.add(key);
    else if (isItemPast(item)) alreadyHad.add(key);
    else if (isItemWanted(item)) wanted.add(key);
  }

  for (const key of owned) {
    alreadyHad.delete(key);
    wanted.delete(key);
    virtual.delete(key);
  }
  for (const key of alreadyHad) {
    wanted.delete(key);
    virtual.delete(key);
  }
  for (const key of wanted) {
    virtual.delete(key);
  }

  return { owned, virtual, alreadyHad, wanted };
}

export function resolveChecklistCardPresence(
  print: { setId: string; printKey: string; finish?: string | null },
  buckets: {
    owned: ReadonlySet<string>;
    virtual: ReadonlySet<string>;
    alreadyHad: ReadonlySet<string>;
    wanted: ReadonlySet<string>;
  },
  masterSet: boolean,
  isOwned: (
    set: ReadonlySet<string>,
    print: { setId: string; printKey: string; finish?: string | null },
    masterSet: boolean,
  ) => boolean,
): ChecklistCardPresence {
  if (isOwned(buckets.owned, print, masterSet)) return "owned";
  if (isOwned(buckets.alreadyHad, print, masterSet)) return "past";
  if (isOwned(buckets.wanted, print, masterSet)) return "wanted";
  if (isOwned(buckets.virtual, print, masterSet)) return "virtual";
  return "missing";
}

/** Buy-plan / missing pool: not held, not virtual-covered, not « déjà eu ». */
export function checklistCardCountsAsMissing(
  presence: ChecklistCardPresence,
): boolean {
  return presence === "missing" || presence === "wanted";
}

/** Counts toward « en main » completion. */
export function checklistCardCountsAsInHand(
  presence: ChecklistCardPresence,
): boolean {
  return presence === "owned";
}

/** Counts toward « tout possédé (scellé compris) ». */
export function checklistCardCountsAsCovered(
  presence: ChecklistCardPresence,
): boolean {
  return presence === "owned" || presence === "virtual";
}
