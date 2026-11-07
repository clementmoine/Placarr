import {
  absenceSinceInputValue,
  isAbsenceReason,
  isItemPresence,
  priceCentsInputValue,
  type ItemPresence,
} from "@/core/collect/itemAbsence";
import type { ItemModalLifecycleFormSlice } from "@/components/modals/ItemModalLifecycleFields";

/** Fields the bulk lifecycle PATCH can overlay (empty = leave alone). */
export type BulkLifecyclePatch = {
  presence?: ItemPresence;
  absenceReason?: string | null;
  absenceSince?: string | null;
  absenceRecipient?: string | null;
  absenceSource?: string | null;
  absenceCarrier?: string | null;
  absenceTracking?: string | null;
  absenceOrderRef?: string | null;
  absenceOrderUrl?: string | null;
  absenceNote?: string | null;
  absencePriceCents?: number | null;
  absenceExpectedAt?: string | null;
  purchasePriceCents?: number | null;
  purchasedAt?: string | null;
};

export type BulkLifecycleSourceItem = {
  presence?: string | null;
  absenceReason?: string | null;
  absenceSince?: Date | string | null;
  absenceRecipient?: string | null;
  absenceSource?: string | null;
  absenceCarrier?: string | null;
  absenceTracking?: string | null;
  absenceOrderRef?: string | null;
  absenceOrderUrl?: string | null;
  absenceNote?: string | null;
  absencePriceCents?: number | null;
  absenceExpectedAt?: Date | string | null;
  purchasePriceCents?: number | null;
  purchasedAt?: Date | string | null;
};

export function emptyBulkLifecycleForm(): ItemModalLifecycleFormSlice {
  return {
    presence: "",
    absenceReason: "",
    absenceSince: "",
    absenceRecipient: "",
    absenceSource: "",
    absenceCarrier: "",
    absenceTracking: "",
    absenceOrderRef: "",
    absenceOrderUrl: "",
    absenceNote: "",
    absencePrice: "",
    absenceExpectedAt: "",
    purchasePrice: "",
    purchasedAt: "",
    gradeStatus: "raw",
    gradeHouse: "",
    gradeLabel: "",
    gradeCertNo: "",
    gradedAt: "",
  };
}

function commonText(values: readonly string[]): string {
  if (values.length === 0) return "";
  const first = values[0] ?? "";
  return values.every((value) => value === first) ? first : "";
}

function rowFromItem(item: BulkLifecycleSourceItem): ItemModalLifecycleFormSlice {
  const presence = isItemPresence(item.presence) ? item.presence : "owned";
  const base = emptyBulkLifecycleForm();
  if (presence === "owned") {
    return {
      ...base,
      presence,
      purchasePrice: priceCentsInputValue(item.purchasePriceCents),
      purchasedAt: absenceSinceInputValue(item.purchasedAt),
    };
  }
  return {
    ...base,
    presence,
    absenceReason: isAbsenceReason(item.absenceReason)
      ? item.absenceReason
      : "",
    absenceSince: absenceSinceInputValue(item.absenceSince),
    absenceRecipient: item.absenceRecipient?.trim() || "",
    absenceSource: item.absenceSource?.trim() || "",
    absenceCarrier: item.absenceCarrier?.trim() || "",
    absenceTracking: item.absenceTracking?.trim() || "",
    absenceOrderRef: item.absenceOrderRef?.trim() || "",
    absenceOrderUrl: item.absenceOrderUrl?.trim() || "",
    absenceNote: item.absenceNote?.trim() || "",
    absencePrice: priceCentsInputValue(item.absencePriceCents),
    absenceExpectedAt: absenceSinceInputValue(item.absenceExpectedAt),
    purchasePrice: priceCentsInputValue(item.purchasePriceCents),
    purchasedAt: absenceSinceInputValue(item.purchasedAt),
  };
}

/**
 * Shared form values for a multi-select edit.
 * Identical across items → that value; mixed → empty (leave alone on apply).
 */
export function commonBulkLifecycleForm(
  items: readonly BulkLifecycleSourceItem[],
): ItemModalLifecycleFormSlice {
  if (items.length === 0) return emptyBulkLifecycleForm();
  const rows = items.map(rowFromItem);
  const keys = Object.keys(emptyBulkLifecycleForm()) as Array<
    keyof ItemModalLifecycleFormSlice
  >;
  const out = emptyBulkLifecycleForm();
  for (const key of keys) {
    if (key === "gradeStatus") {
      out.gradeStatus = "raw";
      continue;
    }
    if (
      key === "gradeHouse" ||
      key === "gradeLabel" ||
      key === "gradeCertNo" ||
      key === "gradedAt"
    ) {
      out[key] = "";
      continue;
    }
    out[key] = commonText(rows.map((row) => String(row[key] ?? ""))) as never;
  }
  return out;
}

type DirtyFlags = Partial<
  Record<keyof ItemModalLifecycleFormSlice, boolean | object>
>;

/**
 * Only dirty, non-empty fields become a PATCH overlay.
 * Empty dirty string fields are omitted (leave existing values alone).
 */
export function bulkLifecyclePatchFromDirty(args: {
  values: ItemModalLifecycleFormSlice;
  dirtyFields: DirtyFlags;
  parsePriceCents: (value: unknown) => number | null;
}): BulkLifecyclePatch {
  const { values, dirtyFields, parsePriceCents } = args;
  const patch: BulkLifecyclePatch = {};

  if (dirtyFields.presence && isItemPresence(values.presence)) {
    patch.presence = values.presence;
  }
  if (dirtyFields.absenceReason) {
    const next = values.absenceReason?.trim() || null;
    if (next) patch.absenceReason = next;
  }
  if (dirtyFields.absenceSince) {
    const next = values.absenceSince?.trim() || null;
    if (next) patch.absenceSince = next;
  }
  if (dirtyFields.absenceRecipient) {
    const next = values.absenceRecipient?.trim() || null;
    if (next) patch.absenceRecipient = next;
  }
  if (dirtyFields.absenceSource) {
    const next = values.absenceSource?.trim() || null;
    if (next) patch.absenceSource = next;
  }
  if (dirtyFields.absenceCarrier) {
    const next = values.absenceCarrier?.trim() || null;
    if (next) patch.absenceCarrier = next;
  }
  if (dirtyFields.absenceTracking) {
    const next = values.absenceTracking?.trim() || null;
    if (next) patch.absenceTracking = next;
  }
  if (dirtyFields.absenceOrderRef) {
    const next = values.absenceOrderRef?.trim() || null;
    if (next) patch.absenceOrderRef = next;
  }
  if (dirtyFields.absenceOrderUrl) {
    const next = values.absenceOrderUrl?.trim() || null;
    if (next) patch.absenceOrderUrl = next;
  }
  if (dirtyFields.absenceNote) {
    const next = values.absenceNote?.trim() || null;
    if (next) patch.absenceNote = next;
  }
  if (dirtyFields.absencePrice) {
    const cents = parsePriceCents(values.absencePrice);
    if (cents != null) patch.absencePriceCents = cents;
  }
  if (dirtyFields.absenceExpectedAt) {
    const next = values.absenceExpectedAt?.trim() || null;
    if (next) patch.absenceExpectedAt = next;
  }
  if (dirtyFields.purchasePrice) {
    const cents = parsePriceCents(values.purchasePrice);
    if (cents != null) patch.purchasePriceCents = cents;
  }
  if (dirtyFields.purchasedAt) {
    const next = values.purchasedAt?.trim() || null;
    if (next) patch.purchasedAt = next;
  }

  return patch;
}

export function bulkLifecyclePatchIsEmpty(patch: BulkLifecyclePatch): boolean {
  return Object.keys(patch).length === 0;
}
