import { describe, expect, it } from "vitest";

import {
  applyAbsenceAction,
  commitAbsenceWrite,
  absenceSinceInputValue,
  buildPresenceEvent,
  countsAsOwned,
  calendarDaysBetween,
  formatAbsenceBadge,
  formatAbsencePriceEuros,
  inferPresenceEventKind,
  ORDERED_STALE_AFTER_DAYS,
  resolveAbsenceReminder,
  sumSoldAbsenceCents,
  isAwaitingReceiptReason,
  isDefinitiveAbsenceReason,
  isItemOnLoan,
  isTemporaryAbsenceReason,
  migrateLoanToAbsence,
  normalizeItemAbsenceInput,
  normalizeItemLoanInput,
  ownedAbsenceState,
  presenceForReason,
} from "./itemAbsence";

describe("presenceForReason", () => {
  it.each([
    ["loaned", "away"],
    ["ordered", "away"],
    ["expected", "away"],
    ["repair", "away"],
    ["rental", "away"],
    ["sold", "past"],
    ["exchanged", "past"],
    ["gifted", "past"],
    ["discarded", "past"],
    ["consumed", "past"],
    ["lost", "past"],
    ["stolen", "past"],
  ] as const)("%s → %s", (reason, presence) => {
    expect(presenceForReason(reason)).toBe(presence);
    expect(isTemporaryAbsenceReason(reason)).toBe(presence === "away");
    expect(isDefinitiveAbsenceReason(reason)).toBe(presence === "past");
  });
});

describe("countsAsOwned", () => {
  it("counts owned and away, including a legacy wanted row, not past", () => {
    expect(countsAsOwned({ presence: "owned" })).toBe(true);
    expect(countsAsOwned({ presence: "away" })).toBe(true);
    expect(countsAsOwned({ presence: "wanted" })).toBe(true);
    expect(countsAsOwned({ presence: "past" })).toBe(false);
    expect(countsAsOwned({})).toBe(true);
  });
});

describe("isItemOnLoan", () => {
  it("is true for away+loaned with a recipient", () => {
    expect(
      isItemOnLoan({
        presence: "away",
        absenceReason: "loaned",
        absenceRecipient: "Alice",
      }),
    ).toBe(true);
    expect(
      isItemOnLoan({
        presence: "away",
        absenceReason: "loaned",
        absenceRecipient: "  ",
      }),
    ).toBe(false);
    expect(
      isItemOnLoan({
        presence: "away",
        absenceReason: "ordered",
        absenceRecipient: null,
      }),
    ).toBe(false);
  });
});

describe("formatAbsenceBadge", () => {
  it("returns null when owned", () => {
    expect(formatAbsenceBadge({ presence: "owned" })).toBeNull();
    expect(formatAbsenceBadge({})).toBeNull();
  });

  it("shows loan without requiring a recipient", () => {
    expect(
      formatAbsenceBadge({
        presence: "away",
        absenceReason: "loaned",
      }),
    ).toEqual({ tone: "away", labelKey: "loaned" });
    expect(
      formatAbsenceBadge({
        presence: "away",
        absenceReason: "loaned",
        absenceRecipient: "Alice",
      }),
    ).toEqual({ tone: "away", labelKey: "loaned_to", name: "Alice" });
  });

  it("covers ordered / expected / sold, and reads legacy wanted as away", () => {
    expect(
      formatAbsenceBadge({
        presence: "away",
        absenceReason: "ordered",
        absenceCarrier: "Chronopost",
      }),
    ).toEqual({
      tone: "away",
      labelKey: "ordered_detail",
      detail: "Chronopost",
    });
    expect(
      formatAbsenceBadge({ presence: "away", absenceReason: "expected" }),
    ).toEqual({ tone: "away", labelKey: "expected" });
    expect(
      formatAbsenceBadge({ presence: "past", absenceReason: "sold" }),
    ).toEqual({ tone: "past", labelKey: "sold" });
    expect(
      formatAbsenceBadge({
        presence: "past",
        absenceReason: "sold",
        absencePriceCents: 2500,
      }),
    ).toEqual({ tone: "past", labelKey: "sold_price", price: "25,00 €" });
    expect(
      formatAbsenceBadge({
        presence: "past",
        absenceReason: "sold",
        absenceSource: "Vinted",
        absencePriceCents: 1200,
      }),
    ).toEqual({
      tone: "past",
      labelKey: "sold_detail_price",
      detail: "Vinted",
      price: "12,00 €",
    });
    expect(
      formatAbsenceBadge({
        presence: "past",
        absenceReason: "exchanged",
        tradeCounterpartName: "Luffy",
      }),
    ).toEqual({
      tone: "past",
      labelKey: "exchanged_for",
      name: "Luffy",
    });
    expect(formatAbsenceBadge({ presence: "wanted" })).toEqual({
      tone: "away",
      labelKey: "away",
    });
  });
});

describe("absence reminders", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");

  it("calendarDaysBetween uses UTC calendar days", () => {
    expect(calendarDaysBetween("2026-10-18", now)).toBe(21);
    expect(calendarDaysBetween(now, "2026-11-09")).toBe(1);
  });

  it("flags stale orders and upcoming returns", () => {
    expect(
      formatAbsenceBadge(
        {
          presence: "away",
          absenceReason: "ordered",
          absenceSince: "2026-10-18",
          absenceSource: "Cardmarket",
        },
        { now },
      ),
    ).toEqual({
      tone: "away",
      labelKey: "ordered_ago_detail",
      detail: "Cardmarket",
      days: "21",
    });
    expect(ORDERED_STALE_AFTER_DAYS).toBe(14);
    expect(
      resolveAbsenceReminder(
        {
          presence: "away",
          absenceReason: "loaned",
          absenceRecipient: "Bob",
          absenceExpectedAt: "2026-11-09",
        },
        now,
      ),
    ).toEqual({
      labelKey: "return_tomorrow_to",
      name: "Bob",
    });
    expect(
      formatAbsenceBadge(
        {
          presence: "away",
          absenceReason: "loaned",
          absenceRecipient: "Bob",
          absenceExpectedAt: "2026-11-01",
        },
        { now },
      ),
    ).toEqual({
      tone: "away",
      labelKey: "return_overdue_to",
      name: "Bob",
      days: "7",
    });
  });
});

describe("sumSoldAbsenceCents", () => {
  it("sums past+sold prices only", () => {
    expect(
      sumSoldAbsenceCents([
        {
          presence: "past",
          absenceReason: "sold",
          absencePriceCents: 1000,
        },
        {
          presence: "past",
          absenceReason: "sold",
          absencePriceCents: 250,
        },
        {
          presence: "past",
          absenceReason: "gifted",
          absencePriceCents: 9999,
        },
        { presence: "owned", absencePriceCents: 500 },
      ]),
    ).toEqual({ cents: 1250, count: 2 });
    expect(formatAbsencePriceEuros(31250)).toBe("312,50 €");
  });
});

describe("migrateLoanToAbsence", () => {
  it("maps a loan note to away+loaned", () => {
    const migrated = migrateLoanToAbsence("Bob", "2026-01-15");
    expect(migrated.presence).toBe("away");
    expect(migrated.absenceReason).toBe("loaned");
    expect(migrated.absenceRecipient).toBe("Bob");
    expect(absenceSinceInputValue(migrated.absenceSince)).toBe("2026-01-15");
  });

  it("clears when the borrower is empty", () => {
    expect(migrateLoanToAbsence("  ", new Date())).toEqual(ownedAbsenceState());
    expect(migrateLoanToAbsence(null, null)).toEqual(ownedAbsenceState());
  });
});

describe("applyAbsenceAction", () => {
  it("departs to away for temporary reasons", () => {
    const { fields, event } = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "ordered",
      carrier: "Chronopost",
      tracking: "XX",
      source: "Cardmarket",
    });
    expect(fields.presence).toBe("away");
    expect(fields.absenceReason).toBe("ordered");
    expect(fields.absenceCarrier).toBe("Chronopost");
    expect(fields.absenceSource).toBe("Cardmarket");
    expect(event.kind).toBe("departed");
    expect(event.toPresence).toBe("away");
  });

  it("departs to past for sold with optional price", () => {
    const { fields, event } = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "sold",
      source: "Vinted",
      priceCents: "12.50",
    });
    expect(fields.presence).toBe("past");
    expect(fields.absenceReason).toBe("sold");
    expect(fields.absencePriceCents).toBe(1250);
    expect(event.kind).toBe("departed");
  });

  it("returns away → owned", () => {
    const current = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "loaned",
      recipient: "Alice",
    }).fields;
    const { fields, event } = applyAbsenceAction(current, { type: "return" });
    expect(fields).toEqual(ownedAbsenceState());
    expect(event.kind).toBe("returned");
  });

  it("receives expected / ordered as received_from_order", () => {
    expect(isAwaitingReceiptReason("expected")).toBe(true);
    expect(isAwaitingReceiptReason("ordered")).toBe(true);
    expect(isAwaitingReceiptReason("loaned")).toBe(false);
    for (const reason of ["ordered", "expected"] as const) {
      const current = applyAbsenceAction(ownedAbsenceState(), {
        type: "depart",
        reason,
      }).fields;
      const { event } = applyAbsenceAction(current, { type: "return" });
      expect(event.kind).toBe("received_from_order");
    }
  });

  it("marks consumed as past (déjà eu, not missing)", () => {
    const { fields } = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "consumed",
    });
    expect(fields.presence).toBe("past");
    expect(fields.absenceReason).toBe("consumed");
    expect(countsAsOwned(fields)).toBe(false);
  });

  it("recovers past → owned even after a sale", () => {
    const current = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "sold",
      priceCents: 500,
    }).fields;
    const { fields, event } = applyAbsenceAction(current, { type: "recover" });
    expect(fields).toEqual(ownedAbsenceState());
    expect(event.kind).toBe("recovered");
    expect(event.fromPresence).toBe("past");
  });

  it("rejects illegal transitions", () => {
    expect(() =>
      applyAbsenceAction(ownedAbsenceState(), { type: "return" }),
    ).toThrow(/return/);
    expect(() =>
      applyAbsenceAction(ownedAbsenceState(), { type: "recover" }),
    ).toThrow(/recover/);
  });
});

describe("inferPresenceEventKind / buildPresenceEvent", () => {
  it("classifies recover and a departure", () => {
    expect(inferPresenceEventKind("past", "owned")).toBe("recovered");
    expect(
      buildPresenceEvent({ from: "owned", to: "away", reason: "loaned" }).kind,
    ).toBe("departed");
  });
});

describe("commitAbsenceWrite", () => {
  it("receives an awaited copy through the state machine", () => {
    const current = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "ordered",
      orderRef: "CMD-1",
    }).fields;
    const write = commitAbsenceWrite(current, { presence: "owned" });
    expect(write?.fields).toEqual(ownedAbsenceState());
    expect(write?.event?.kind).toBe("received_from_order");
    expect(write?.event?.fromPresence).toBe("away");
  });

  it("recovers a past copy through the state machine", () => {
    const current = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "sold",
    }).fields;
    const write = commitAbsenceWrite(current, { presence: "owned" });
    expect(write?.event?.kind).toBe("recovered");
  });

  it("does not emit an event when only a note changes", () => {
    const current = applyAbsenceAction(ownedAbsenceState(), {
      type: "depart",
      reason: "loaned",
      recipient: "Alice",
    }).fields;
    const write = commitAbsenceWrite(current, {
      presence: "away",
      absenceReason: "loaned",
      absenceRecipient: "Alice",
      absenceNote: "rappel",
      absenceSince: current.absenceSince,
    });
    expect(write?.event).toBeNull();
    expect(write?.fields.absenceNote).toBe("rappel");
    expect(write?.fields.presence).toBe("away");
  });

  it("reads a legacy wanted payload as an away departure", () => {
    const write = commitAbsenceWrite(ownedAbsenceState(), {
      presence: "wanted",
      absenceReason: "ordered",
      absenceOrderRef: "CMD-9",
    });
    expect(write?.fields.presence).toBe("away");
    expect(write?.fields.absenceReason).toBe("ordered");
    expect(write?.fields.absenceOrderRef).toBe("CMD-9");
    expect(write?.event?.kind).toBe("departed");
  });
});

describe("normalizeItemAbsenceInput", () => {
  it("returns undefined when neither field is present", () => {
    expect(normalizeItemAbsenceInput({})).toBeUndefined();
  });

  it("maps legacy loan payloads", () => {
    const result = normalizeItemAbsenceInput({
      loanedTo: "Bob",
      loanedAt: "2026-01-15",
    });
    expect(result?.presence).toBe("away");
    expect(result?.absenceReason).toBe("loaned");
    expect(result?.absenceRecipient).toBe("Bob");
    expect(absenceSinceInputValue(result?.absenceSince)).toBe("2026-01-15");
  });

  it("clears on empty legacy borrower", () => {
    expect(
      normalizeItemAbsenceInput({ loanedTo: "", loanedAt: "2026-09-01" }),
    ).toEqual(ownedAbsenceState());
  });

  it("defaults the date when departing without since", () => {
    const result = normalizeItemAbsenceInput({
      absenceReason: "repair",
    });
    expect(result?.presence).toBe("away");
    expect(result?.absenceReason).toBe("repair");
    expect(result?.absenceSince).toBeInstanceOf(Date);
  });

  it("forces past for definitive reasons even if client sends away", () => {
    const result = normalizeItemAbsenceInput({
      presence: "away",
      absenceReason: "discarded",
    });
    expect(result?.presence).toBe("past");
    expect(result?.absenceReason).toBe("discarded");
  });

  it("clears when presence is owned", () => {
    expect(normalizeItemAbsenceInput({ presence: "owned" })).toEqual(
      ownedAbsenceState(),
    );
  });

  it("parses sold price in euros", () => {
    const result = normalizeItemAbsenceInput({
      absenceReason: "sold",
      absencePriceCents: "9.99",
      absenceSource: "Leboncoin",
    });
    expect(result?.absencePriceCents).toBe(999);
    expect(result?.absenceSource).toBe("Leboncoin");
  });
});

describe("normalizeItemLoanInput (compat)", () => {
  it("keeps the old loan-shaped result", () => {
    expect(normalizeItemLoanInput({})).toBeUndefined();
    expect(
      normalizeItemLoanInput({ loanedTo: "", loanedAt: "2026-09-01" }),
    ).toEqual({ loanedTo: null, loanedAt: null });
    const result = normalizeItemLoanInput({ loanedTo: "Bob" });
    expect(result?.loanedTo).toBe("Bob");
    expect(result?.loanedAt).toBeInstanceOf(Date);
  });
});
