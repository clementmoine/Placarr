/**
 * Audit timeline for a shelf item — presence + sealed open/declare events.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId } from "@/lib/routing/resolveIds";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const { itemId: rawId } = await context.params;
  const shelfId = req.nextUrl.searchParams.get("shelfId");
  const resolvedId = await resolveItemId(rawId, shelfId, auth.user.id);

  const item = await prisma.item.findUnique({
    where: { id: resolvedId },
    select: { id: true, userId: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const events = await prisma.itemPresenceEvent.findMany({
    where: { itemId: item.id },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      at: true,
      fromPresence: true,
      toPresence: true,
      reason: true,
      kind: true,
      snapshot: true,
    },
  });

  return NextResponse.json({
    itemId: item.id,
    events: events.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      fromPresence: row.fromPresence,
      toPresence: row.toPresence,
      reason: row.reason,
      kind: row.kind,
      snapshot:
        row.snapshot && typeof row.snapshot === "object"
          ? (row.snapshot as Record<string, unknown>)
          : null,
    })),
  });
}
