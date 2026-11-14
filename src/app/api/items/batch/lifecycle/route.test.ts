import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  item: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  itemPresenceEvent: {
    createMany: vi.fn(),
  },
  transaction: vi.fn(),
  resolveShelfId: vi.fn(),
  resolveItemId: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: h.requireGuestOrHigher,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: h.item,
    itemPresenceEvent: h.itemPresenceEvent,
    $transaction: h.transaction,
  },
}));
vi.mock("@/lib/routing/resolveIds", () => ({
  resolveShelfId: h.resolveShelfId,
  resolveItemId: h.resolveItemId,
}));

import { PATCH } from "./route";

const USER = { user: { id: "u1", role: "user" } };

function withBody(body: unknown) {
  return new NextRequest("http://localhost/api/items/batch/lifecycle", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/items/batch/lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireGuestOrHigher.mockResolvedValue(USER);
    h.resolveItemId.mockImplementation(async (id: string) => id);
    h.resolveShelfId.mockImplementation(async (id: string) => id);
    h.item.update.mockResolvedValue({});
    h.transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    h.itemPresenceEvent.createMany.mockResolvedValue({ count: 2 });
  });

  it("overlays ordered onto owned items and records events", async () => {
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        userId: "u1",
        shelfId: "s1",
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
        purchasePriceCents: null,
        purchasedAt: null,
      },
      {
        id: "i2",
        userId: "u1",
        shelfId: "s1",
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
        purchasePriceCents: null,
        purchasedAt: null,
      },
    ]);

    const res = await PATCH(
      withBody({
        itemIds: ["i1", "i2"],
        sourceShelfId: "s1",
        presence: "away",
        absenceReason: "ordered",
        absenceSource: "Cardmarket",
        absenceSince: "2026-11-07",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      count: 2,
      sourceShelfIds: ["s1"],
    });
    expect(h.item.update).toHaveBeenCalledTimes(2);
    expect(h.item.update.mock.calls[0][0].data).toMatchObject({
      presence: "away",
      absenceReason: "ordered",
      absenceSource: "Cardmarket",
    });
    expect(h.itemPresenceEvent.createMany).toHaveBeenCalled();
  });

  it("merges a partial source overlay without wiping presence", async () => {
    h.item.findMany.mockResolvedValue([
      {
        id: "i1",
        userId: "u1",
        shelfId: "s1",
        presence: "away",
        absenceReason: "ordered",
        absenceSince: new Date("2026-11-01"),
        absenceRecipient: null,
        absenceSource: null,
        absenceCarrier: null,
        absenceTracking: null,
        absenceOrderRef: null,
        absenceOrderUrl: null,
        absenceNote: null,
        absencePriceCents: null,
        absenceExpectedAt: null,
        purchasePriceCents: null,
        purchasedAt: null,
      },
    ]);

    const res = await PATCH(
      withBody({
        itemIds: ["i1"],
        absenceSource: "Vinted",
      }),
    );

    expect(res.status).toBe(200);
    expect(h.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          presence: "away",
          absenceReason: "ordered",
          absenceSource: "Vinted",
        }),
      }),
    );
  });

  it("rejects empty selection", async () => {
    const res = await PATCH(withBody({ itemIds: [], presence: "away" }));
    expect(res.status).toBe(400);
  });

  it("rejects payload without presence or purchase fields", async () => {
    const res = await PATCH(withBody({ itemIds: ["i1"] }));
    expect(res.status).toBe(400);
  });

  it("blocks guests", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 403 }),
    );
    const res = await PATCH(
      withBody({
        itemIds: ["i1"],
        presence: "away",
        absenceReason: "ordered",
      }),
    );
    expect(res.status).toBe(403);
  });
});
