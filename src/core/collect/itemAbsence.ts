/**
 * Shelf absence — single notion that absorbs the old personal-loan note.
 *
 * `owned` = on the shelf. `away` = temporary out (still counts as owned for
 * checklists). `wanted` = sought after a cancelled wait. `past` = left the
 * active collection (sold, discarded, …) but always recoverable.
 */

export const ITEM_PRESENCES = ["owned", "away", "wanted", "past"] as const;
export type ItemPresence = (typeof ITEM_PRESENCES)[number];

export const TEMPORARY_ABSENCE_REASONS = [
  "loaned",
  /** Prefer {@link isAwaitingReceiptReason} — `ordered` is the narrow legacy. */
  "ordered",
  /** Broad « attendu » (order, friend, trade in flight…). */
  "expected",
  "repair",
  "rental",
] as const;

export const DEFINITIVE_ABSENCE_REASONS = [
  "sold",
  "exchanged",
  "gifted",
  "discarded",
  /** Used up / played through — still « déjà eu », not missing. */
  "consumed",
  "lost",
  "stolen",
] as const;

export const ABSENCE_REASONS = [
  ...TEMPORARY_ABSENCE_REASONS,
  ...DEFINITIVE_ABSENCE_REASONS,
] as const;

export type TemporaryAbsenceReason = (typeof TEMPORARY_ABSENCE_REASONS)[number];
export type DefinitiveAbsenceReason = (typeof DEFINITIVE_ABSENCE_REASONS)[number];
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

export const PRESENCE_EVENT_KINDS = [
  "acquired",
  "departed",
  "returned",
  "cancelled_to_wanted",
  "received_from_order",
  "recovered",
  /** Sealed parent opened — presence unchanged; snapshot holds composition. */
  "opened",
  /** Child item created from an open / declare. */
  "materialized",
  /** Group declaration of pulls (random display) without per-booster links. */
  "declared",
  /** Child re-attached under a compatible opened sealed parent. */
  "contained",
  /** Content link removed — child free on the shelf again. */
  "detached",
  /** Sent to a grading house (WIP) — presence unchanged. */
  "grade_submitted",
  /** Slab label recorded / updated — presence unchanged. */
  "grade_updated",
] as const;
export type PresenceEventKind = (typeof PRESENCE_EVENT_KINDS)[number];

const PRESENCE_EVENT_KIND_SET = new Set<string>(PRESENCE_EVENT_KINDS);

export function isPresenceEventKind(value: unknown): value is PresenceEventKind {
  return typeof value === "string" && PRESENCE_EVENT_KIND_SET.has(value);
}

export type ItemAbsenceFields = {
  presence: ItemPresence;
  absenceReason: AbsenceReason | null;
  absenceSince: Date | null;
  absenceRecipient: string | null;
  absenceSource: string | null;
  absenceCarrier: string | null;
  absenceTracking: string | null;
  absenceOrderRef: string | null;
  absenceOrderUrl: string | null;
  absenceNote: string | null;
  absencePriceCents: number | null;
  absenceExpectedAt: Date | null;
};

export type ItemAbsenceSnapshot = Partial<{
  absenceReason: AbsenceReason | null;
  absenceSince: Date | string | null;
  absenceRecipient: string | null;
  absenceSource: string | null;
  absenceCarrier: string | null;
  absenceTracking: string | null;
  absenceOrderRef: string | null;
  absenceOrderUrl: string | null;
  absenceNote: string | null;
  absencePriceCents: number | null;
  absenceExpectedAt: Date | string | null;
}>;

export type ItemPresenceEventDraft = {
  at: Date;
  fromPresence: ItemPresence;
  toPresence: ItemPresence;
  reason: AbsenceReason | null;
  kind: PresenceEventKind;
  snapshot: Record<string, unknown> | null;
};

const TEMPORARY_SET = new Set<string>(TEMPORARY_ABSENCE_REASONS);
const DEFINITIVE_SET = new Set<string>(DEFINITIVE_ABSENCE_REASONS);
const REASON_SET = new Set<string>(ABSENCE_REASONS);
const PRESENCE_SET = new Set<string>(ITEM_PRESENCES);

export function isItemPresence(value: unknown): value is ItemPresence {
  return typeof value === "string" && PRESENCE_SET.has(value);
}

export function isAbsenceReason(value: unknown): value is AbsenceReason {
  return typeof value === "string" && REASON_SET.has(value);
}

export function isTemporaryAbsenceReason(
  value: unknown,
): value is TemporaryAbsenceReason {
  return typeof value === "string" && TEMPORARY_SET.has(value);
}

export function isDefinitiveAbsenceReason(
  value: unknown,
): value is DefinitiveAbsenceReason {
  return typeof value === "string" && DEFINITIVE_SET.has(value);
}

/**
 * Temporary wait that still counts as owned (avoid double-buy) — « attendu ».
 * `ordered` is kept as a narrow alias of `expected`.
 */
export function isAwaitingReceiptReason(
  value: unknown,
): value is "ordered" | "expected" {
  return value === "ordered" || value === "expected";
}

/** Presence implied by a reason when declaring a departure. */
export function presenceForReason(reason: AbsenceReason): "away" | "past" {
  return isTemporaryAbsenceReason(reason) ? "away" : "past";
}

/** Checklist / active-collection “I have this” — owned or temporarily away. */
export function countsAsOwned(
  item: Pick<ItemAbsenceFields, "presence"> | { presence?: ItemPresence | null },
): boolean {
  const presence = item.presence ?? "owned";
  return presence === "owned" || presence === "away";
}

export function isItemAway(
  item: Pick<ItemAbsenceFields, "presence"> | { presence?: ItemPresence | null },
): boolean {
  return (item.presence ?? "owned") === "away";
}

export function isItemPast(
  item: Pick<ItemAbsenceFields, "presence"> | { presence?: ItemPresence | null },
): boolean {
  return item.presence === "past";
}

export function isItemWanted(
  item: Pick<ItemAbsenceFields, "presence"> | { presence?: ItemPresence | null },
): boolean {
  return item.presence === "wanted";
}

type LoanCompatFields = {
  presence?: ItemPresence | null;
  absenceReason?: AbsenceReason | null;
  absenceRecipient?: string | null;
  absenceSince?: Date | string | null;
  /** @deprecated migrated column — accepted only while callers catch up */
  loanedTo?: string | null;
  loanedAt?: Date | string | null;
};

/** Loan-shaped away copy (compat with former isItemOnLoan). */
export function isItemOnLoan(item: LoanCompatFields): boolean {
  return Boolean(loanRecipient(item));
}

/** Borrower name for loan badges — absence model, with legacy loanedTo fallback. */
export function loanRecipient(item: LoanCompatFields): string | null {
  if (
    (item.presence ?? "owned") === "away" &&
    item.absenceReason === "loaned"
  ) {
    const recipient = item.absenceRecipient?.trim();
    if (recipient) return recipient;
  }
  const legacy = item.loanedTo?.trim();
  return legacy || null;
}

/** Date for loan badges — absenceSince, with legacy loanedAt fallback. */
export function loanSince(item: LoanCompatFields): Date | string | null {
  if (
    (item.presence ?? "owned") === "away" &&
    item.absenceReason === "loaned"
  ) {
    return item.absenceSince ?? null;
  }
  return item.loanedAt ?? null;
}

export type AbsenceBadgeTone = "away" | "past" | "wanted";

/**
 * Compact shelf / fiche tag for non-owned presence.
 * `labelKey` → `items.absence.badge.<key>` ; optional `{name}` / `{detail}` / `{price}`.
 */
export type AbsenceBadgeInfo = {
  tone: AbsenceBadgeTone;
  labelKey: string;
  name?: string;
  detail?: string;
  /** Formatted sale price (`25 €`) when reason is sold. */
  price?: string;
};

type AbsenceBadgeFields = LoanCompatFields &
  Partial<
    Pick<
      ItemAbsenceFields,
      | "absenceSource"
      | "absenceCarrier"
      | "absenceReason"
      | "presence"
      | "absencePriceCents"
    >
  > & {
    /** Optional trade counterpart title for `exchanged ↔ name`. */
    tradeCounterpartName?: string | null;
  };

/** Euro label from absence sale cents — null if unknown / zero. */
export function formatAbsencePriceEuros(
  cents: number | null | undefined,
): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
    return null;
  }
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * Sum of `absencePriceCents` on past + sold items (cession stats).
 */
export function sumSoldAbsenceCents(
  items: readonly {
    presence?: ItemPresence | string | null;
    absenceReason?: AbsenceReason | string | null;
    absencePriceCents?: number | null;
  }[],
): { cents: number; count: number } {
  let cents = 0;
  let count = 0;
  for (const item of items) {
    if ((item.presence ?? "owned") !== "past") continue;
    if (item.absenceReason !== "sold") continue;
    const price = item.absencePriceCents;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }
    cents += Math.round(price);
    count += 1;
  }
  return { cents, count };
}

/**
 * Badge for away / wanted / past. Owned → null.
 * Loan without recipient still shows « Prêté » (not silent).
 */
export function formatAbsenceBadge(
  item: AbsenceBadgeFields | null | undefined,
): AbsenceBadgeInfo | null {
  if (!item) return null;
  const presence = item.presence ?? "owned";
  if (presence === "owned") return null;

  if (presence === "wanted") {
    return { tone: "wanted", labelKey: "wanted" };
  }

  const reason = isAbsenceReason(item.absenceReason)
    ? item.absenceReason
    : null;
  const recipient =
    item.absenceRecipient?.trim() ||
    (typeof item.loanedTo === "string" ? item.loanedTo.trim() : "") ||
    null;
  const carrier = item.absenceCarrier?.trim() || null;
  const source = item.absenceSource?.trim() || null;
  const tradeName = item.tradeCounterpartName?.trim() || null;
  const detail = carrier || source || undefined;

  if (presence === "away") {
    if (reason === "loaned" || (!reason && recipient)) {
      return recipient
        ? { tone: "away", labelKey: "loaned_to", name: recipient }
        : { tone: "away", labelKey: "loaned" };
    }
    if (reason === "rental") {
      return recipient
        ? { tone: "away", labelKey: "rental_to", name: recipient }
        : { tone: "away", labelKey: "rental" };
    }
    if (reason === "ordered" || reason === "expected") {
      return detail
        ? { tone: "away", labelKey: `${reason}_detail`, detail }
        : { tone: "away", labelKey: reason };
    }
    if (reason === "repair") {
      return { tone: "away", labelKey: "repair" };
    }
    return { tone: "away", labelKey: reason ?? "away" };
  }

  // past
  if (reason === "sold") {
    const price = formatAbsencePriceEuros(item.absencePriceCents);
    if (detail && price) {
      return { tone: "past", labelKey: "sold_detail_price", detail, price };
    }
    if (price) {
      return { tone: "past", labelKey: "sold_price", price };
    }
    return detail
      ? { tone: "past", labelKey: "sold_detail", detail }
      : { tone: "past", labelKey: "sold" };
  }
  if (reason === "exchanged") {
    return tradeName
      ? { tone: "past", labelKey: "exchanged_for", name: tradeName }
      : { tone: "past", labelKey: "exchanged" };
  }
  if (
    reason === "gifted" ||
    reason === "discarded" ||
    reason === "consumed" ||
    reason === "lost" ||
    reason === "stolen"
  ) {
    return { tone: "past", labelKey: reason };
  }
  return { tone: "past", labelKey: "past" };
}

export function ownedAbsenceState(): ItemAbsenceFields {
  return {
    presence: "owned",
    absenceReason: null,
    absenceSince: null,
    absenceRecipient: null,
    absenceSource: null,
    absenceCarrier: null,
    absenceTracking: null,
    absenceOrderRef: null,
    absenceOrderUrl: null,
    absenceNote: null,
    absencePriceCents: null,
    absenceExpectedAt: null,
  };
}

/** Map a pre-migration loan note onto the absence model. */
export function migrateLoanToAbsence(
  loanedTo: string | null | undefined,
  loanedAt: Date | string | null | undefined,
): ItemAbsenceFields {
  const recipient = typeof loanedTo === "string" ? loanedTo.trim() : "";
  if (!recipient) return ownedAbsenceState();
  return {
    ...ownedAbsenceState(),
    presence: "away",
    absenceReason: "loaned",
    absenceRecipient: recipient,
    absenceSince: parseDateInput(loanedAt) ?? startOfToday(),
  };
}

/** `yyyy-mm-dd` for `<input type="date">`, or empty when unset. */
export function absenceSinceInputValue(
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

/** Euros string for a price `<input>`, or empty when unset. */
export function priceCentsInputValue(
  cents: number | null | undefined,
): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const euros = cents / 100;
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2);
}

/** @deprecated use absenceSinceInputValue */
export const loanedAtInputValue = absenceSinceInputValue;

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Accept euros (`"12.50"`) or integer cents (`"1250"` / number). */
export function parsePriceCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().replace(",", ".");
    // Accept euros ("12.50") or integer cents ("1250") — euros when decimal point.
    if (normalized.includes(".")) {
      const euros = Number(normalized);
      if (!Number.isFinite(euros) || euros < 0) return null;
      return Math.round(euros * 100);
    }
    const cents = Number(normalized);
    if (!Number.isFinite(cents) || cents < 0) return null;
    return Math.round(cents);
  }
  return null;
}

function snapshotFromFields(
  fields: Partial<ItemAbsenceFields>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of [
    "absenceReason",
    "absenceSince",
    "absenceRecipient",
    "absenceSource",
    "absenceCarrier",
    "absenceTracking",
    "absenceOrderRef",
    "absenceOrderUrl",
    "absenceNote",
    "absencePriceCents",
    "absenceExpectedAt",
  ] as const) {
    if (key in fields && fields[key] != null) {
      const value = fields[key];
      snapshot[key] =
        value instanceof Date ? value.toISOString() : value;
    }
  }
  return snapshot;
}

export function inferPresenceEventKind(
  from: ItemPresence,
  to: ItemPresence,
  opts?: { reason?: AbsenceReason | null; receiveFromOrder?: boolean },
): PresenceEventKind {
  if (from === to) return "acquired";
  if (to === "owned") {
    if (from === "past") return "recovered";
    if (from === "wanted" || opts?.receiveFromOrder) return "received_from_order";
    if (from === "away") return "returned";
    return "acquired";
  }
  if (to === "wanted" && from === "away") return "cancelled_to_wanted";
  if ((to === "away" || to === "past") && from === "owned") return "departed";
  if ((to === "away" || to === "past") && from === "wanted") return "departed";
  if (to === "past" && from === "away") return "departed";
  return "departed";
}

export function buildPresenceEvent(args: {
  from: ItemPresence;
  to: ItemPresence;
  reason?: AbsenceReason | null;
  at?: Date;
  fields?: Partial<ItemAbsenceFields>;
  kind?: PresenceEventKind;
  receiveFromOrder?: boolean;
  /** Merged into the event snapshot (sealed SKU / purchase / open composition). */
  extraSnapshot?: Record<string, unknown> | null;
}): ItemPresenceEventDraft {
  const kind =
    args.kind ??
    inferPresenceEventKind(args.from, args.to, {
      reason: args.reason,
      receiveFromOrder: args.receiveFromOrder,
    });
  const snap = {
    ...(args.fields ? snapshotFromFields(args.fields) : {}),
    ...(args.extraSnapshot ?? {}),
  };
  return {
    at: args.at ?? new Date(),
    fromPresence: args.from,
    toPresence: args.to,
    reason: args.reason ?? args.fields?.absenceReason ?? null,
    kind,
    snapshot: Object.keys(snap).length ? snap : null,
  };
}

export type AbsenceAction =
  | {
      type: "depart";
      reason: AbsenceReason;
      since?: Date | string | null;
      recipient?: string | null;
      source?: string | null;
      carrier?: string | null;
      tracking?: string | null;
      orderRef?: string | null;
      orderUrl?: string | null;
      note?: string | null;
      priceCents?: number | string | null;
      expectedAt?: Date | string | null;
    }
  | { type: "return" }
  | { type: "cancel" }
  | { type: "recover" }
  | { type: "receive"; fromOrder?: boolean };

export type AbsenceActionResult = {
  fields: ItemAbsenceFields;
  event: ItemPresenceEventDraft;
};

function readCurrent(
  current?: Partial<ItemAbsenceFields> | null,
): ItemAbsenceFields {
  return {
    ...ownedAbsenceState(),
    ...current,
    presence: current?.presence ?? "owned",
  };
}

/**
 * Pure state machine for absence transitions.
 * Throws on illegal moves (e.g. cancel when not away).
 */
export function applyAbsenceAction(
  current: Partial<ItemAbsenceFields> | null | undefined,
  action: AbsenceAction,
): AbsenceActionResult {
  const from = readCurrent(current);
  const fromPresence = from.presence;

  if (action.type === "depart") {
    const presence = presenceForReason(action.reason);
    const fields: ItemAbsenceFields = {
      presence,
      absenceReason: action.reason,
      absenceSince: parseDateInput(action.since) ?? startOfToday(),
      absenceRecipient: trimToNull(action.recipient),
      absenceSource: trimToNull(action.source),
      absenceCarrier: trimToNull(action.carrier),
      absenceTracking: trimToNull(action.tracking),
      absenceOrderRef: trimToNull(action.orderRef),
      absenceOrderUrl: trimToNull(action.orderUrl),
      absenceNote: trimToNull(action.note),
      absencePriceCents:
        action.reason === "sold" ? parsePriceCents(action.priceCents) : null,
      absenceExpectedAt: parseDateInput(action.expectedAt),
    };
    if (action.reason === "loaned" || action.reason === "rental") {
      // Recipient stays optional at the model layer; UI may require it.
    }
    return {
      fields,
      event: buildPresenceEvent({
        from: fromPresence,
        to: presence,
        reason: action.reason,
        at: fields.absenceSince ?? undefined,
        fields,
        kind: "departed",
      }),
    };
  }

  if (action.type === "return" || action.type === "receive") {
    if (fromPresence !== "away" && fromPresence !== "wanted") {
      throw new Error(`Cannot ${action.type} from presence ${fromPresence}`);
    }
    const fields = ownedAbsenceState();
    const awaiting = isAwaitingReceiptReason(from.absenceReason);
    const receiveFromOrder =
      action.type === "receive" ? action.fromOrder !== false : awaiting;
    return {
      fields,
      event: buildPresenceEvent({
        from: fromPresence,
        to: "owned",
        fields: from,
        receiveFromOrder:
          action.type === "receive" ? receiveFromOrder : undefined,
        kind:
          action.type === "receive" || awaiting
            ? "received_from_order"
            : "returned",
      }),
    };
  }

  if (action.type === "cancel") {
    if (fromPresence !== "away") {
      throw new Error(`Cannot cancel from presence ${fromPresence}`);
    }
    const fields: ItemAbsenceFields = {
      ...from,
      presence: "wanted",
      // Keep reason/details as breadcrumbs of what was cancelled.
    };
    return {
      fields,
      event: buildPresenceEvent({
        from: "away",
        to: "wanted",
        reason: from.absenceReason,
        fields: from,
        kind: "cancelled_to_wanted",
      }),
    };
  }

  // recover
  if (fromPresence !== "past") {
    throw new Error(`Cannot recover from presence ${fromPresence}`);
  }
  const fields = ownedAbsenceState();
  return {
    fields,
    event: buildPresenceEvent({
      from: "past",
      to: "owned",
      reason: from.absenceReason,
      fields: from,
      kind: "recovered",
    }),
  };
}

function hasAbsencePayloadKey(raw: Record<string, unknown>): boolean {
  const keys = [
    "presence",
    "absenceReason",
    "absenceSince",
    "absenceRecipient",
    "absenceSource",
    "absenceCarrier",
    "absenceTracking",
    "absenceOrderRef",
    "absenceOrderUrl",
    "absenceNote",
    "absencePriceCents",
    "absenceExpectedAt",
    "loanedTo",
    "loanedAt",
  ];
  return keys.some((key) => key in raw);
}

/**
 * Normalize PATCH/POST absence fields.
 * Returns undefined when neither absence nor legacy loan fields are present.
 * Empty loan / explicit presence=owned clears the absence.
 */
export function normalizeItemAbsenceInput(
  raw: Record<string, unknown>,
): ItemAbsenceFields | undefined {
  if (!hasAbsencePayloadKey(raw)) return undefined;

  // Legacy loan-only payload (UI not yet migrated).
  const legacyLoanOnly =
    ("loanedTo" in raw || "loanedAt" in raw) &&
    !("presence" in raw) &&
    !("absenceReason" in raw) &&
    !("absenceRecipient" in raw);

  if (legacyLoanOnly) {
    return migrateLoanToAbsence(
      typeof raw.loanedTo === "string" ? raw.loanedTo : null,
      raw.loanedAt as Date | string | null | undefined,
    );
  }

  if (raw.presence === "owned" || raw.presence === null) {
    return ownedAbsenceState();
  }

  const reasonFromBody = isAbsenceReason(raw.absenceReason)
    ? raw.absenceReason
    : null;
  const recipient =
    trimToNull(raw.absenceRecipient) ?? trimToNull(raw.loanedTo);

  // Clear when recipient emptied on a loan-shaped update without new reason.
  if (
    ("absenceRecipient" in raw || "loanedTo" in raw) &&
    recipient == null &&
    !reasonFromBody &&
    !isItemPresence(raw.presence)
  ) {
    return ownedAbsenceState();
  }

  if (isItemPresence(raw.presence) && raw.presence === "wanted") {
    return {
      ...ownedAbsenceState(),
      presence: "wanted",
      absenceReason: reasonFromBody,
      absenceSince:
        parseDateInput(raw.absenceSince) ??
        parseDateInput(raw.loanedAt) ??
        startOfToday(),
      absenceRecipient: recipient,
      absenceSource: trimToNull(raw.absenceSource),
      absenceCarrier: trimToNull(raw.absenceCarrier),
      absenceTracking: trimToNull(raw.absenceTracking),
      absenceOrderRef: trimToNull(raw.absenceOrderRef),
      absenceOrderUrl: trimToNull(raw.absenceOrderUrl),
      absenceNote: trimToNull(raw.absenceNote),
      absencePriceCents: parsePriceCents(raw.absencePriceCents),
      absenceExpectedAt: parseDateInput(raw.absenceExpectedAt),
    };
  }

  const reason =
    reasonFromBody ?? (recipient ? ("loaned" as const) : null);

  if (!reason) {
    return ownedAbsenceState();
  }

  // Client presence cannot override the category implied by the reason
  // (except wanted, handled above).
  const resolvedPresence = presenceForReason(reason);

  return {
    presence: resolvedPresence,
    absenceReason: reason,
    absenceSince:
      parseDateInput(raw.absenceSince) ??
      parseDateInput(raw.loanedAt) ??
      startOfToday(),
    absenceRecipient: recipient,
    absenceSource: trimToNull(raw.absenceSource),
    absenceCarrier: trimToNull(raw.absenceCarrier),
    absenceTracking: trimToNull(raw.absenceTracking),
    absenceOrderRef: trimToNull(raw.absenceOrderRef),
    absenceOrderUrl: trimToNull(raw.absenceOrderUrl),
    absenceNote: trimToNull(raw.absenceNote),
    absencePriceCents:
      reason === "sold" ? parsePriceCents(raw.absencePriceCents) : null,
    absenceExpectedAt: parseDateInput(raw.absenceExpectedAt),
  };
}

/** @deprecated use normalizeItemAbsenceInput — maps to loan-shaped result for old tests */
export function normalizeItemLoanInput(raw: {
  loanedTo?: unknown;
  loanedAt?: unknown;
}): { loanedTo: string | null; loanedAt: Date | null } | undefined {
  const hasTo = "loanedTo" in raw;
  const hasAt = "loanedAt" in raw;
  if (!hasTo && !hasAt) return undefined;
  const absence = normalizeItemAbsenceInput({
    loanedTo: raw.loanedTo,
    loanedAt: raw.loanedAt,
  });
  if (!absence) return undefined;
  if (absence.presence === "owned") {
    return { loanedTo: null, loanedAt: null };
  }
  return {
    loanedTo: absence.absenceRecipient,
    loanedAt: absence.absenceSince,
  };
}
