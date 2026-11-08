import { NextRequest, NextResponse } from "next/server";

import { tradeLinksForItem } from "@/core/collect/itemTrade";
import { requireGuestOrHigher } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId } from "@/lib/routing/resolveIds";

const counterpartSelect = {
  id: true,
  name: true,
  slug: true,
  shelfId: true,
} as const;

async function loadOwnedItem(
  rawId: string,
  shelfIdParam: string | null,
  userId: string,
  role: string,
) {
  const resolvedId = await resolveItemId(rawId, shelfIdParam, userId);
  const item = await prisma.item.findUnique({
    where: { id: resolvedId },
    select: { id: true, userId: true, shelfId: true, name: true },
  });
  if (!item) return { error: NextResponse.json({ error: "Item not found" }, { status: 404 }) };
  if (role !== "admin" && item.userId !== userId) {
    return {
      error: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  }
  return { item };
}

/**
 * Trade counterparts for an item (bidirectional read of ItemTradeLink).
 * POST links this item (out) to a counterpart (in) — the piece received.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const { itemId: rawId } = await context.params;
  const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
  const loaded = await loadOwnedItem(
    rawId,
    shelfIdParam,
    auth.user.id,
    auth.user.role,
  );
  if ("error" in loaded) return loaded.error;

  const edges = await prisma.itemTradeLink.findMany({
    where: {
      OR: [{ itemOutId: loaded.item.id }, { itemInId: loaded.item.id }],
    },
    include: {
      itemOut: { select: counterpartSelect },
      itemIn: { select: counterpartSelect },
    },
    orderBy: { createdAt: "asc" },
  });

  const out = edges.filter((edge) => edge.itemOutId === loaded.item.id);
  const inn = edges.filter((edge) => edge.itemInId === loaded.item.id);

  return NextResponse.json({
    itemId: loaded.item.id,
    links: tradeLinksForItem(loaded.item.id, { out, in: inn }),
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot link trades" },
      { status: 403 },
    );
  }

  const { itemId: rawId } = await context.params;
  const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
  const loaded = await loadOwnedItem(
    rawId,
    shelfIdParam,
    auth.user.id,
    auth.user.role,
  );
  if ("error" in loaded) return loaded.error;

  const body = (await req.json()) as {
    counterpartItemId?: unknown;
    note?: unknown;
  };
  const counterpartRaw =
    typeof body.counterpartItemId === "string"
      ? body.counterpartItemId.trim()
      : "";
  if (!counterpartRaw) {
    return NextResponse.json(
      { error: "counterpartItemId is required" },
      { status: 400 },
    );
  }

  const counterpartId = await resolveItemId(
    counterpartRaw,
    shelfIdParam,
    auth.user.id,
  );
  if (counterpartId === loaded.item.id) {
    return NextResponse.json(
      { error: "Cannot trade an item against itself" },
      { status: 400 },
    );
  }

  const counterpart = await prisma.item.findUnique({
    where: { id: counterpartId },
    select: counterpartSelect,
  });
  if (!counterpart) {
    return NextResponse.json(
      { error: "Counterpart item not found" },
      { status: 404 },
    );
  }
  if (auth.user.role !== "admin") {
    const owner = await prisma.item.findUnique({
      where: { id: counterpartId },
      select: { userId: true },
    });
    if (!owner || owner.userId !== auth.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const link = await prisma.itemTradeLink.upsert({
    where: {
      itemOutId_itemInId: {
        itemOutId: loaded.item.id,
        itemInId: counterpart.id,
      },
    },
    create: {
      itemOutId: loaded.item.id,
      itemInId: counterpart.id,
      note,
    },
    update: { note },
    include: {
      itemOut: { select: counterpartSelect },
      itemIn: { select: counterpartSelect },
    },
  });

  const views = tradeLinksForItem(loaded.item.id, { out: [link], in: [] });
  return NextResponse.json({ link: views[0] ?? null }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot unlink trades" },
      { status: 403 },
    );
  }

  const { itemId: rawId } = await context.params;
  const shelfIdParam = req.nextUrl.searchParams.get("shelfId");
  const loaded = await loadOwnedItem(
    rawId,
    shelfIdParam,
    auth.user.id,
    auth.user.role,
  );
  if ("error" in loaded) return loaded.error;

  const body = (await req.json().catch(() => ({}))) as {
    linkId?: unknown;
    counterpartItemId?: unknown;
  };

  const linkId = typeof body.linkId === "string" ? body.linkId.trim() : "";
  const counterpartRaw =
    typeof body.counterpartItemId === "string"
      ? body.counterpartItemId.trim()
      : "";

  if (linkId) {
    const existing = await prisma.itemTradeLink.findUnique({
      where: { id: linkId },
      select: { id: true, itemOutId: true, itemInId: true },
    });
    if (
      !existing ||
      (existing.itemOutId !== loaded.item.id &&
        existing.itemInId !== loaded.item.id)
    ) {
      return NextResponse.json({ error: "Trade link not found" }, { status: 404 });
    }
    await prisma.itemTradeLink.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  }

  if (counterpartRaw) {
    const counterpartId = await resolveItemId(
      counterpartRaw,
      shelfIdParam,
      auth.user.id,
    );
    await prisma.itemTradeLink.deleteMany({
      where: {
        OR: [
          { itemOutId: loaded.item.id, itemInId: counterpartId },
          { itemOutId: counterpartId, itemInId: loaded.item.id },
        ],
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Provide linkId or counterpartItemId" },
    { status: 400 },
  );
}
