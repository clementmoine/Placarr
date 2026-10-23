/**
 * Personal loan note on a collection item (mono-user).
 * `loanedTo` set ⇒ currently out; both cleared ⇒ returned / at home.
 */

export type ItemLoanFields = {
  loanedTo?: string | null;
  loanedAt?: Date | string | null;
};

export function isItemOnLoan(item: ItemLoanFields): boolean {
  return Boolean(item.loanedTo?.trim());
}

/** `yyyy-mm-dd` for `<input type="date">`, or empty when unset. */
export function loanedAtInputValue(
  value: Date | string | null | undefined,
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Normalize PATCH/POST loan fields.
 * Empty borrower clears the loan; a borrower without a date defaults to today.
 */
export function normalizeItemLoanInput(raw: {
  loanedTo?: unknown;
  loanedAt?: unknown;
}): { loanedTo: string | null; loanedAt: Date | null } | undefined {
  const hasTo = "loanedTo" in raw;
  const hasAt = "loanedAt" in raw;
  if (!hasTo && !hasAt) return undefined;

  const toRaw = hasTo ? raw.loanedTo : undefined;
  const atRaw = hasAt ? raw.loanedAt : undefined;

  const loanedTo =
    typeof toRaw === "string" && toRaw.trim() ? toRaw.trim() : null;

  if (!loanedTo) {
    return { loanedTo: null, loanedAt: null };
  }

  let loanedAt: Date | null = null;
  if (typeof atRaw === "string" && atRaw.trim()) {
    const parsed = new Date(atRaw.trim());
    loanedAt = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else if (atRaw instanceof Date && !Number.isNaN(atRaw.getTime())) {
    loanedAt = atRaw;
  }

  if (!loanedAt) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    loanedAt = today;
  }

  return { loanedTo, loanedAt };
}
