import { Condition, type Prisma, Type } from "@/generated/prisma/browser";
import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { resolveItemId, resolveShelfId } from "@/lib/routing/resolveIds";
import { allocateUniqueItemSlug } from "@/lib/routing/itemSlug";
import {
  scheduleBatchItemMetadataRefresh,
  shelfMoveMetadataResetData,
} from "@/core/collect/jobs/scheduleMetadataRefresh";
import { stampItemMetadataRefresh } from "@/core/collect/jobs/metadataRefreshSession";
import { ITEM_CONDITIONS } from "@/core/collect/condition";
import {
  resolveUniquePrintCandidate,
  supportsPrintSearch,
} from "@/core/identify/printSearch";
import { parsePrintKey } from "@/core/identify/printKey";

const VALID_CONDITIONS = new Set<string>(ITEM_CONDITIONS);
const CREATE_CHUNK_SIZE = 100;
const MOVE_CHUNK_SIZE = 100;
const DELETE_CHUNK_SIZE = 100;

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

const itemCreateSelect = {
  id: true,
  name: true,
} satisfies Prisma.ItemSelect;

type CreatedBatchItem = Prisma.ItemGetPayload<{
  select: typeof itemCreateSelect;
}>;

function normalizeNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const names = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  if (names.length === 0) return null;
  return names;
}

type BatchItemRow = {
  id: string;
  userId: string;
  shelfId: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  backgroundImageUrl: string | null;
  metadata: { title: string | null } | null;
  shelf: { type: Type; name: string };
};

async function resolveBatchItems(
  itemIds: unknown,
  sourceShelfId: unknown,
  userId: string,
  role: string,
): Promise<
  | { error: NextResponse }
  | { items: BatchItemRow[]; resolvedSourceShelfId: string | null }
> {
  const normalizedItemIds = normalizeItemIds(itemIds);
  if (!normalizedItemIds) {
    return {
      error: NextResponse.json(
        { error: "Provide at least one item ID" },
        { status: 400 },
      ),
    };
  }

  const resolvedSourceShelfId =
    typeof sourceShelfId === "string" && sourceShelfId.trim()
      ? await resolveShelfId(sourceShelfId, userId)
      : null;

  const resolvedIds = await Promise.all(
    normalizedItemIds.map((itemId) =>
      resolveItemId(itemId, resolvedSourceShelfId, userId),
    ),
  );

  const items = await prisma.item.findMany({
    where: { id: { in: resolvedIds } },
    select: {
      id: true,
      userId: true,
      shelfId: true,
      name: true,
      barcode: true,
      imageUrl: true,
      backgroundImageUrl: true,
      metadata: { select: { title: true } },
      shelf: { select: { type: true, name: true } },
    },
  });

  if (items.length !== resolvedIds.length) {
    return {
      error: NextResponse.json(
        { error: "One or more items not found" },
        { status: 404 },
      ),
    };
  }

  for (const item of items) {
    if (role !== "admin" && item.userId !== userId) {
      return {
        error: NextResponse.json(
          { error: "You don't have permission to update one or more items" },
          { status: 403 },
        ),
      };
    }
  }

  return { items, resolvedSourceShelfId };
}

function scheduleMetadataRefreshByShelf(items: BatchItemRow[]): void {
  const groups = new Map<string, BatchItemRow[]>();
  for (const item of items) {
    const bucket = groups.get(item.shelfId) ?? [];
    bucket.push(item);
    groups.set(item.shelfId, bucket);
  }

  for (const group of groups.values()) {
    const shelf = group[0]?.shelf;
    if (!shelf) continue;

    scheduleBatchItemMetadataRefresh(
      group.map((item) => ({
        itemId: item.id,
        lookupQuery: item.metadata?.title || item.name,
        barcode: item.barcode,
      })),
      { type: shelf.type, name: shelf.name },
    );
  }
}

async function createItemsInChunks(
  rows: Array<{ name: string; printKey: string | null }>,
  data: {
    shelfId: string;
    userId: string;
    condition: Condition;
  },
): Promise<CreatedBatchItem[]> {
  const created: CreatedBatchItem[] = [];
  const reservedSlugs = new Set<string>();

  for (let offset = 0; offset < rows.length; offset += CREATE_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CREATE_CHUNK_SIZE);
    const planned: Array<{ name: string; slug: string; printKey: string | null }> =
      [];
    for (const row of chunk) {
      const slug = await allocateUniqueItemSlug(data.shelfId, row.name, {
        reserved: reservedSlugs,
      });
      reservedSlugs.add(slug);
      planned.push({ name: row.name, slug, printKey: row.printKey });
    }

    const batch = await prisma.$transaction(
      planned.map((row) =>
        prisma.item.create({
          data: {
            shelfId: data.shelfId,
            name: row.name,
            slug: row.slug,
            condition: data.condition,
            userId: data.userId,
            printKey: row.printKey,
          },
          select: itemCreateSelect,
        }),
      ),
    );
    created.push(...batch);
  }

  return created;
}

/**
 * On print shelves, pasted codes (`TFC#001`) resolve to the catalog title +
 * printKey before insert. Unresolved lines stay as typed (honest empty later).
 */
async function resolveBatchCreateRows(
  names: string[],
  shelfType: Type,
): Promise<Array<{ name: string; printKey: string | null; lookupQuery: string }>> {
  if (!supportsPrintSearch(shelfType)) {
    return names.map((name) => ({
      name,
      printKey: null,
      lookupQuery: name,
    }));
  }

  const rows: Array<{
    name: string;
    printKey: string | null;
    lookupQuery: string;
  }> = [];
  for (const query of names) {
    const hit = await resolveUniquePrintCandidate(query, shelfType);
    const printKey =
      hit?.printKey && parsePrintKey(hit.printKey)
        ? hit.printKey.trim().toLowerCase()
        : null;
    if (hit && printKey) {
      rows.push({
        name: hit.title.trim() || query,
        printKey,
        lookupQuery: hit.title.trim() || query,
      });
    } else {
      rows.push({ name: query, printKey: null, lookupQuery: query });
    }
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot create items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { shelfId, names, condition = Condition.new } = body;

    if (typeof shelfId !== "string" || !shelfId.trim()) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
      );
    }

    const normalizedNames = normalizeNames(names);
    if (!normalizedNames) {
      return NextResponse.json(
        { error: "Provide at least one item name" },
        { status: 400 },
      );
    }

    if (!VALID_CONDITIONS.has(condition)) {
      return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
    }

    const resolvedShelfId = await resolveShelfId(shelfId, auth.user.id);
    const shelf = await prisma.shelf.findUnique({
      where: { id: resolvedShelfId },
      select: { type: true, userId: true, name: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to add items to this shelf" },
        { status: 403 },
      );
    }

    const createRows = await resolveBatchCreateRows(
      normalizedNames,
      shelf.type,
    );
    const createdItems = await createItemsInChunks(createRows, {
      shelfId: resolvedShelfId,
      userId: auth.user.id,
      condition,
    });

    scheduleBatchItemMetadataRefresh(
      createdItems.map((item, index) => ({
        itemId: item.id,
        lookupQuery: createRows[index]?.lookupQuery ?? item.name,
      })),
      shelf,
    );

    return NextResponse.json({ count: createdItems.length });
  } catch (error) {
    console.error("[API Items Batch] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot move items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { itemIds, targetShelfId, sourceShelfId } = body;

    if (typeof targetShelfId !== "string" || !targetShelfId.trim()) {
      return NextResponse.json(
        { error: "Target shelf ID is required" },
        { status: 400 },
      );
    }

    const normalizedItemIds = normalizeItemIds(itemIds);
    if (!normalizedItemIds) {
      return NextResponse.json(
        { error: "Provide at least one item ID" },
        { status: 400 },
      );
    }

    const resolvedTargetShelfId = await resolveShelfId(
      targetShelfId,
      auth.user.id,
    );
    const resolvedSourceShelfId =
      typeof sourceShelfId === "string" && sourceShelfId.trim()
        ? await resolveShelfId(sourceShelfId, auth.user.id)
        : null;

    const targetShelf = await prisma.shelf.findUnique({
      where: { id: resolvedTargetShelfId },
      select: { id: true, userId: true, type: true, name: true },
    });

    if (!targetShelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    if (auth.user.role !== "admin" && targetShelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to move items to this shelf" },
        { status: 403 },
      );
    }

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
        name: true,
        barcode: true,
        imageUrl: true,
        backgroundImageUrl: true,
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
          { error: "You don't have permission to move one or more items" },
          { status: 403 },
        );
      }
    }

    const movableItems = items.filter(
      (item) => item.shelfId !== resolvedTargetShelfId,
    );

    const reservedSlugs = new Set<string>();
    const movePlans: Array<{
      id: string;
      name: string;
      barcode: string | null;
      imageUrl: string | null;
      backgroundImageUrl: string | null;
      shelfId: string;
      slug: string;
    }> = [];
    for (const item of movableItems) {
      const slug = await allocateUniqueItemSlug(
        resolvedTargetShelfId,
        item.name,
        { excludeItemId: item.id, reserved: reservedSlugs },
      );
      if (slug) reservedSlugs.add(slug);
      movePlans.push({ ...item, slug });
    }

    for (let offset = 0; offset < movePlans.length; offset += MOVE_CHUNK_SIZE) {
      const chunk = movePlans.slice(offset, offset + MOVE_CHUNK_SIZE);
      await prisma.$transaction(
        chunk.map((item) =>
          prisma.item.update({
            where: { id: item.id },
            data: {
              shelfId: resolvedTargetShelfId,
              slug: item.slug,
              ...shelfMoveMetadataResetData(item),
            },
          }),
        ),
      );
    }

    if (movableItems.length > 0 && targetShelf) {
      scheduleBatchItemMetadataRefresh(
        movableItems.map((item) => ({
          itemId: item.id,
          lookupQuery: item.name,
          barcode: item.barcode,
        })),
        { type: targetShelf.type, name: targetShelf.name },
      );
    }

    const sourceShelfIds = Array.from(
      new Set(movableItems.map((item) => item.shelfId).filter(Boolean)),
    );

    return NextResponse.json({
      count: movableItems.length,
      targetShelfId: resolvedTargetShelfId,
      sourceShelfIds,
    });
  } catch (error) {
    console.error("[API Items Batch Move] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot delete items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { itemIds, sourceShelfId } = body;

    const resolved = await resolveBatchItems(
      itemIds,
      sourceShelfId,
      auth.user.id,
      auth.user.role,
    );
    if ("error" in resolved) return resolved.error;

    const { items } = resolved;
    const ids = items.map((item) => item.id);

    for (let offset = 0; offset < ids.length; offset += DELETE_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + DELETE_CHUNK_SIZE);
      await prisma.item.deleteMany({
        where: { id: { in: chunk } },
      });
    }

    const sourceShelfIds = Array.from(
      new Set(items.map((item) => item.shelfId).filter(Boolean)),
    );

    return NextResponse.json({
      count: items.length,
      sourceShelfIds,
    });
  } catch (error) {
    console.error("[API Items Batch Delete] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot refresh items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { itemIds, sourceShelfId } = body;

    const resolved = await resolveBatchItems(
      itemIds,
      sourceShelfId,
      auth.user.id,
      auth.user.role,
    );
    if ("error" in resolved) return resolved.error;

    const { items } = resolved;

    // Persist in-flight flags before enqueue so client polling can start
    // immediately (batch refresh targets items that already have metadata).
    for (const item of items) {
      await stampItemMetadataRefresh(item.id);
    }

    scheduleMetadataRefreshByShelf(items);

    return NextResponse.json({ count: items.length });
  } catch (error) {
    console.error("[API Items Batch Refresh] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
