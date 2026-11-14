/**
 * Shelf absence — single notion that absorbs the old personal-loan note.
 *
 * `owned` = on the shelf. `away` = temporary out (still counts as owned for
 * checklists). `past` = left the active collection (sold, discarded, …) but
 * always recoverable. Legacy `wanted` rows are read as `away`.
 */

export const ITEM_PRESENCES = ["owned", "away", "past"] as const;
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

/**
 * Stored presence. Legacy `wanted` (cancelled wait) collapses into `away`:
 * absent is the only intermediate state.
 */
export function coerceItemPresence(value: unknown): ItemPresence {
  if (value === "wanted") return "away";
  if (isItemPresence(value)) return value;
  return "owned";
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
  item: { presence?: string | null },
): boolean {
  const presence = coerceItemPresence(item.presence);
  return presence === "owned" || presence === "away";
}

export function isItemAway(item: { presence?: string | null }): boolean {
  return coerceItemPresence(item.presence) === "away";
}

export function isItemPast(item: { presence?: string | null }): boolean {
  return coerceItemPresence(item.presence) === "past";
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
    coerceItemPresence(item.presence) === "away" &&
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
    coerceItemPresence(item.presence) === "away" &&
    item.absenceReason === "loaned"
  ) {
    return item.absenceSince ?? null;
  }
  return item.loanedAt ?? null;
}

export type AbsenceBadgeTone = "away" | "past";

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
  /** Whole days for soft reminders (`ordered_ago`, `return_overdue`, …). */
  days?: string;
};

/** Soft « commandée il y a N j » once the order is this old. */
export const ORDERED_STALE_AFTER_DAYS = 14;

type AbsenceBadgeFields = LoanCompatFields &
  Partial<
    Pick<
      ItemAbsenceFields,
      | "absenceSource"
      | "absenceCarrier"
      | "absenceReason"
      | "presence"
      | "absencePriceCents"
      | "absenceExpectedAt"
    >
  > & {
    /** Optional trade counterpart title for `exchanged ↔ name`. */
    tradeCounterpartName?: string | null;
  };

/** Calendar-day delta (UTC date parts) — null if `from` is missing/invalid. */
export function calendarDaysBetween(
  from: Date | string | null | undefined,
  to: Date | string = new Date(),
): number | null {
  const start = toUtcDay(from);
  const end = toUtcDay(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function toUtcDay(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) return null;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Soft reminders layered on away badges (ordered age, expected return).
 * Prefer expected-return cues when both apply.
 */
export function resolveAbsenceReminder(
  item: AbsenceBadgeFields,
  now: Date = new Date(),
): Pick<AbsenceBadgeInfo, "labelKey" | "detail" | "days" | "name"> | null {
  if (coerceItemPresence(item.presence) !== "away") return null;
  const reason = isAbsenceReason(item.absenceReason)
    ? item.absenceReason
    : null;
  const detail =
    item.absenceCarrier?.trim() || item.absenceSource?.trim() || undefined;
  const recipient =
    item.absenceRecipient?.trim() ||
    (typeof item.loanedTo === "string" ? item.loanedTo.trim() : "") ||
    undefined;

  const hasExpectedAt = Boolean(
    item.absenceExpectedAt != null &&
      String(item.absenceExpectedAt).trim(),
  );
  const daysUntil = hasExpectedAt
    ? calendarDaysBetween(now, item.absenceExpectedAt)
    : null;
  if (
    daysUntil != null &&
    (reason === "loaned" ||
      reason === "rental" ||
      reason === "repair" ||
      reason === "ordered" ||
      reason === "expected" ||
      (!reason && recipient))
  ) {
    if (daysUntil === 0) {
      return {
        labelKey: recipient ? "return_today_to" : "return_today",
        ...(recipient ? { name: recipient } : {}),
      };
    }
    if (daysUntil === 1) {
      return {
        labelKey: recipient ? "return_tomorrow_to" : "return_tomorrow",
        ...(recipient ? { name: recipient } : {}),
      };
    }
    if (daysUntil < 0) {
      return {
        labelKey: recipient ? "return_overdue_to" : "return_overdue",
        days: String(-daysUntil),
        ...(recipient ? { name: recipient } : {}),
      };
    }
    if (daysUntil <= 7) {
      return {
        labelKey: recipient ? "return_in_days_to" : "return_in_days",
        days: String(daysUntil),
        ...(recipient ? { name: recipient } : {}),
      };
    }
  }

  if (reason === "ordered" || reason === "expected") {
    const age = calendarDaysBetween(item.absenceSince, now);
    if (age != null && age >= ORDERED_STALE_AFTER_DAYS) {
      return detail
        ? { labelKey: `${reason}_ago_detail`, detail, days: String(age) }
        : { labelKey: `${reason}_ago`, days: String(age) };
    }
  }
  return null;
}

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
 * Badge for away / past. Owned → null.
 * Loan without recipient still shows « Prêté » (not silent).
 * Soft reminders (stale order / return due) override the away label when set.
 */
export function formatAbsenceBadge(
  item: AbsenceBadgeFields | null | undefined,
  opts?: { now?: Date },
): AbsenceBadgeInfo | null {
  if (!item) return null;
  const presence = coerceItemPresence(item.presence);
  if (presence === "owned") return null;

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
    const reminder = resolveAbsenceReminder(item, opts?.now ?? new Date());
    if (reminder) {
      return { tone: "away", ...reminder };
    }
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
    if (opts?.receiveFromOrder) return "received_from_order";
    if (from === "away") return "returned";
    return "acquired";
  }
  if ((to === "away" || to === "past") && from === "owned") return "departed";
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
    presence: coerceItemPresence(current?.presence),
  };
}

/**
 * Pure state machine for absence transitions.
 * Throws on illegal moves (return / receive when not away, recover when not past).
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
    if (fromPresence !== "away") {
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
 * Legacy stored `wanted` is absent. A payload that still sends it keeps its
 * reason, or `expected` when none was given, so the row is not promoted to owned.
 */
function withoutLegacyWanted(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (raw.presence !== "wanted") return raw;
  if (isAbsenceReason(raw.absenceReason)) {
    return { ...raw, presence: "away" };
  }
  return { ...raw, presence: "away", absenceReason: "expected" };
}

export type AbsenceWrite = {
  fields: ItemAbsenceFields;
  /** Null when the write does not change presence or reason. */
  event: ItemPresenceEventDraft | null;
};

/**
 * Interpret a form / PATCH payload as one state-machine transition.
 * Field-only edits (note, tracking) keep the current presence and emit no event.
 */
export function commitAbsenceWrite(
  current: (Partial<ItemAbsenceFields> & { presence?: string | null }) | null | undefined,
  raw: Record<string, unknown>,
): AbsenceWrite | undefined {
  const fields = normalizeItemAbsenceInput(withoutLegacyWanted(raw));
  if (!fields) return undefined;
  const from = readCurrent(current);
  if (
    fields.presence === from.presence &&
    fields.absenceReason === from.absenceReason
  ) {
    return { fields, event: null };
  }
  if (fields.presence === "owned") {
    if (from.presence === "owned") return { fields, event: null };
    const action: AbsenceAction =
      from.presence === "past"
        ? { type: "recover" }
        : isAwaitingReceiptReason(from.absenceReason)
          ? { type: "receive" }
          : { type: "return" };
    return applyAbsenceAction(from, action);
  }
  if (!fields.absenceReason) return { fields, event: null };
  return applyAbsenceAction(from, {
    type: "depart",
    reason: fields.absenceReason,
    since: fields.absenceSince,
    recipient: fields.absenceRecipient,
    source: fields.absenceSource,
    carrier: fields.absenceCarrier,
    tracking: fields.absenceTracking,
    orderRef: fields.absenceOrderRef,
    orderUrl: fields.absenceOrderUrl,
    note: fields.absenceNote,
    priceCents: fields.absencePriceCents,
    expectedAt: fields.absenceExpectedAt,
  });
}

/**
 * Normalize PATCH/POST absence fields.
 * Returns undefined when neither absence nor legacy loan fields are present.
 * Empty loan / explicit presence=owned clears the absence.
 */
export function normalizeItemAbsenceInput(
  raw: Record<string, unknown>,
): ItemAbsenceFields | undefined {
  raw = withoutLegacyWanted(raw);
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

  const reason =
    reasonFromBody ?? (recipient ? ("loaned" as const) : null);

  if (!reason) {
    return ownedAbsenceState();
  }

  // Client presence cannot override the category implied by the reason.
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
