import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId } from "@/lib/routing/resolveIds";
import {
  itemPricesContextFromRecord,
  readItemPrices,
} from "@/services/pricing/itemDisplay";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const session = await requireGuestOrHigher(req);
  if (session instanceof NextResponse) return session;

  const { itemId } = await context.params;
  const shelfId = req.nextUrl.searchParams.get("shelfId");

  try {
    const resolvedItemId = await resolveItemId(
      itemId,
      shelfId,
      session.user.id,
    );
    const item = await prisma.item.findUnique({
      where: { id: resolvedItemId },
      include: { shelf: true, metadata: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const prices = await readItemPrices(itemPricesContextFromRecord(item));
    return NextResponse.json(prices);
  } catch (error) {
    console.error(`[API Prices] Error handling request:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
