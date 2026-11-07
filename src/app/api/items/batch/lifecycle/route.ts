import { type Prisma } from "@/generated/prisma/browser";
import { NextRequest, NextResponse } from "next/server";

import {
  buildPresenceEvent,
  normalizeItemAbsenceInput,
  parsePriceCents,
} from "@/core/collect/itemAbsence";
import { requireGuestOrHigher } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId, resolveShelfId } from "@/lib/routing/resolveIds";

const ABSENCE_OVERLAY_KEYS = [
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
] as const;

function normalizeItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const ids = Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (ids.length === 0) return null;
  return ids;
}

function hasAbsenceOverlay(patch: Record<string, unknown>): boolean {
  return ABSENCE_OVERLAY_KEYS.some((key) => key in patch);
}

/**
 * Bulk apply presence / absence (+ optional purchase) to selected items.
 * Only keys present in the body are overlaid onto each item (leave-alone
 * semantics for empty / untouched bulk fields).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot edit items" },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { itemIds, sourceShelfId, ...patch } = body;

    const normalizedItemIds = normalizeItemIds(itemIds);
    if (!normalizedItemIds) {
      return NextResponse.json(
        { error: "Provide at least one item ID" },
        { status: 400 },
      );
    }

    const overlayAbsence = hasAbsenceOverlay(patch);
    const hasPurchasePrice = "purchasePriceCents" in patch;
    const hasPurchasedAt = "purchasedAt" in patch;

    if (!overlayAbsence && !hasPurchasePrice && !hasPurchasedAt) {
      return NextResponse.json(
        { error: "Provide presence or purchase fields to update" },
        { status: 400 },
      );
    }

    const resolvedSourceShelfId =
      typeof sourceShelfId === "string" && sourceShelfId.trim()
        ? await resolveShelfId(sourceShelfId, auth.user.id)
        : null;

    const resolvedIds = await Promise.all(
      normalizedItemIds.map((itemId) =>
        resolveItemId(itemId, resolvedSourceShelfId, auth.user.id),
      ),
    );

    const items = await prisma.item.findMany({
      where: { id: { in: resolvedIds } },
      select: {
        id: true,
        userId: true,
        shelfId: true,
        presence: true,
        absenceReason: true,
        absenceSince: true,
        absenceRecipient: true,
        absenceSource: true,
        absenceCarrier: true,
        absenceTracking: true,
        absenceOrderRef: true,
        absenceOrderUrl: true,
        absenceNote: true,
        absencePriceCents: true,
        absenceExpectedAt: true,
        purchasePriceCents: true,
        purchasedAt: true,
      },
    });

    if (items.length !== resolvedIds.length) {
      return NextResponse.json(
        { error: "One or more items not found" },
        { status: 404 },
      );
    }

    for (const item of items) {
      if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
        return NextResponse.json(
          { error: "You don't have permission to update one or more items" },
          { status: 403 },
        );
      }
    }

    const purchaseData: {
      purchasePriceCents?: number | null;
      purchasedAt?: Date | null;
    } = {};
    if (hasPurchasePrice) {
      purchaseData.purchasePriceCents = parsePriceCents(
        patch.purchasePriceCents,
      );
    }
    if (hasPurchasedAt) {
      if (patch.purchasedAt == null || patch.purchasedAt === "") {
        purchaseData.purchasedAt = null;
      } else {
        const d = new Date(patch.purchasedAt as string | number | Date);
        purchaseData.purchasedAt = Number.isNaN(d.getTime()) ? null : d;
      }
    }

    const eventRows: Prisma.ItemPresenceEventCreateManyInput[] = [];
    const updates: Array<{ id: string; data: Prisma.ItemUpdateInput }> = [];

    for (const item of items) {
      const data: Prisma.ItemUpdateInput = { ...purchaseData };

      if (overlayAbsence) {
        const merged: Record<string, unknown> = {
          presence: item.presence,
          absenceReason: item.absenceReason,
          absenceSince: item.absenceSince,
          absenceRecipient: item.absenceRecipient,
          absenceSource: item.absenceSource,
          absenceCarrier: item.absenceCarrier,
          absenceTracking: item.absenceTracking,
          absenceOrderRef: item.absenceOrderRef,
          absenceOrderUrl: item.absenceOrderUrl,
          absenceNote: item.absenceNote,
          absencePriceCents: item.absencePriceCents,
          absenceExpectedAt: item.absenceExpectedAt,
        };
        for (const key of ABSENCE_OVERLAY_KEYS) {
          if (key in patch) merged[key] = patch[key];
        }

        const absencePatch = normalizeItemAbsenceInput(merged);
        if (absencePatch) {
          Object.assign(data, absencePatch);
          const presenceChanged =
            absencePatch.presence !== item.presence ||
            absencePatch.absenceReason !== item.absenceReason;
          if (presenceChanged) {
            const event = buildPresenceEvent({
              from: item.presence,
              to: absencePatch.presence,
              reason: absencePatch.absenceReason,
              at: absencePatch.absenceSince ?? undefined,
              fields: absencePatch,
            });
            eventRows.push({
              itemId: item.id,
              at: event.at,
              fromPresence: event.fromPresence,
              toPresence: event.toPresence,
              reason: event.reason,
              kind: event.kind,
              snapshot:
                event.snapshot == null
                  ? undefined
                  : (event.snapshot as Prisma.InputJsonValue),
            });
          }
        }
      }

      if (Object.keys(data).length > 0) {
        updates.push({ id: item.id, data });
      }
    }

    for (let offset = 0; offset < updates.length; offset += 50) {
      const chunk = updates.slice(offset, offset + 50);
      await prisma.$transaction(
        chunk.map((row) =>
          prisma.item.update({
            where: { id: row.id },
            data: row.data,
          }),
        ),
      );
    }

    if (eventRows.length > 0) {
      await prisma.itemPresenceEvent.createMany({ data: eventRows });
    }

    const sourceShelfIds = Array.from(
      new Set(items.map((item) => item.shelfId).filter(Boolean)),
    );

    return NextResponse.json({
      count: items.length,
      sourceShelfIds,
    });
  } catch (error) {
    console.error("[API Items Batch Lifecycle] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
