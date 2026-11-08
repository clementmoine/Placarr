import {
  isAbsenceReason,
  isAwaitingReceiptReason,
  isItemPresence,
  type AbsenceReason,
  type ItemPresence,
} from "@/core/collect/itemAbsence";
import { itemMatchesBarcodeQuery } from "@/core/collect/search";

/**
 * Finish-exact identity for shelf matching (same rules as print picker ownership).
 * Set-scoped + language-aware.
 */
export function printIdentityKey(
  printKey: string,
  variant: string | null | undefined,
  language: string | null | undefined,
  setCode: string | null | undefined,
): string {
  return [
    (setCode ?? "").trim().toLowerCase(),
    printKey.trim().toLowerCase(),
    (language ?? "").trim().toLowerCase(),
    (variant ?? "").trim().toLowerCase(),
  ].join("|");
}

export type ReceivableShelfItem = {
  id: string;
  name: string;
  slug?: string | null;
  barcode?: string | null;
  printKey?: string | null;
  variant?: string | null;
  language?: string | null;
  setCode?: string | null;
  presence?: ItemPresence | string | null;
  absenceReason?: AbsenceReason | string | null;
  absenceSince?: Date | string | null;
  absenceSource?: string | null;
  absenceRecipient?: string | null;
  absenceCarrier?: string | null;
};

export type ReceivableMatchQuery = {
  printKey: string;
  variant?: string | null;
  language?: string | null;
  setCode?: string | null;
};

/**
 * Items on the shelf that match this print identity and are waiting to arrive
 * (`away`) or sought (`wanted`) — candidates for « tu l’attendais ? ».
 */
export function isReceivablePresence(
  presence: ItemPresence | string | null | undefined,
): boolean {
  return presence === "away" || presence === "wanted";
}

function itemMatchesQuery(
  item: ReceivableShelfItem,
  query: ReceivableMatchQuery,
): boolean {
  const printKey = item.printKey?.trim();
  if (!printKey) return false;
  const queryKey = printIdentityKey(
    query.printKey,
    query.variant,
    query.language,
    query.setCode,
  );
  const exact = printIdentityKey(
    printKey,
    item.variant,
    item.language,
    item.setCode,
  );
  if (exact === queryKey) return true;
  // Legacy item without setCode still matches any set of that print+finish+lang.
  if (!(item.setCode ?? "").trim()) {
    return (
      printIdentityKey(printKey, item.variant, item.language, null) ===
      printIdentityKey(query.printKey, query.variant, query.language, null)
    );
  }
  return false;
}

export function findReceivableShelfMatches(
  items: readonly ReceivableShelfItem[],
  query: ReceivableMatchQuery,
): ReceivableShelfItem[] {
  const printKey = query.printKey?.trim();
  if (!printKey) return [];

  return items.filter((item) => {
    if (!isReceivablePresence(item.presence)) return false;
    return itemMatchesQuery(item, { ...query, printKey });
  });
}

/** Barcode path (games / sealed / ScanFAB) — same away|wanted gate. */
export function findReceivableByBarcode(
  items: readonly ReceivableShelfItem[],
  barcode: string | null | undefined,
): ReceivableShelfItem[] {
  const q = barcode?.trim();
  if (!q) return [];
  return items.filter(
    (item) =>
      isReceivablePresence(item.presence) &&
      itemMatchesBarcodeQuery(item.barcode, q),
  );
}

/**
 * Resolve one preferred receivable hit for a create/add: print identity first,
 * then barcode. Used by ItemModal / ScanFAB when PrintPicker is not in play.
 */
export function resolveReceivableForCreate(
  items: readonly ReceivableShelfItem[],
  query: {
    printKey?: string | null;
    variant?: string | null;
    language?: string | null;
    setCode?: string | null;
    barcode?: string | null;
  },
): ReceivableShelfItem | null {
  const printKey = query.printKey?.trim();
  if (printKey) {
    const byPrint = findReceivableShelfMatches(items, {
      printKey,
      variant: query.variant,
      language: query.language,
      setCode: query.setCode,
    });
    const pick = pickPreferredReceivableMatch(byPrint);
    if (pick) return pick;
  }
  return pickPreferredReceivableMatch(
    findReceivableByBarcode(items, query.barcode),
  );
}

/** Prefer awaiting-receipt (ordered/expected), then other away, then wanted. */
export function pickPreferredReceivableMatch(
  matches: readonly ReceivableShelfItem[],
): ReceivableShelfItem | null {
  if (matches.length === 0) return null;
  const awaiting = matches.find(
    (item) =>
      item.presence === "away" && isAwaitingReceiptReason(item.absenceReason),
  );
  if (awaiting) return awaiting;
  const away = matches.find((item) => item.presence === "away");
  if (away) return away;
  return matches[0] ?? null;
}

export type ReceivablePair = {
  queryIndex: number;
  query: ReceivableMatchQuery & { title?: string };
  match: ReceivableShelfItem;
};

/**
 * For each add row, take at most one preferred receivable shelf item.
 * Consumed match ids are not reused across rows (N commandes → N réceptions).
 */
export function pairReceivableAdds(
  items: readonly ReceivableShelfItem[],
  queries: readonly (ReceivableMatchQuery & { title?: string })[],
): { pairs: ReceivablePair[]; unmatchedIndexes: number[] } {
  const available = [...items];
  const pairs: ReceivablePair[] = [];
  const unmatchedIndexes: number[] = [];

  queries.forEach((query, queryIndex) => {
    const matches = findReceivableShelfMatches(available, query);
    const pick = pickPreferredReceivableMatch(matches);
    if (!pick) {
      unmatchedIndexes.push(queryIndex);
      return;
    }
    pairs.push({ queryIndex, query, match: pick });
    const idx = available.findIndex((item) => item.id === pick.id);
    if (idx >= 0) available.splice(idx, 1);
  });

  return { pairs, unmatchedIndexes };
}

export function receivableMatchLabelFields(item: ReceivableShelfItem): {
  presence: ItemPresence;
  reason: AbsenceReason | null;
  detail: string | null;
} {
  const presence = isItemPresence(item.presence) ? item.presence : "owned";
  const reason = isAbsenceReason(item.absenceReason)
    ? item.absenceReason
    : null;
  const detail =
    item.absenceRecipient?.trim() ||
    item.absenceCarrier?.trim() ||
    item.absenceSource?.trim() ||
    null;
  return { presence, reason, detail };
}
