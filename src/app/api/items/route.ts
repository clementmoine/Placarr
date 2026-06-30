import { Prisma, Type } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { withRequestUiLocale } from "@/lib/locale/serverPreference";

import { cropImageIfNeeded } from "@/lib/media/imageTrim";
import {
  downloadRemoteImage,
  syncCroppedCoverAttachment,
} from "@/services/metadata/storage";
import { presentItem, presentItemFromStorage } from "@/lib/item/present";
import { resolveShelfId, resolveItemId } from "@/lib/routing/resolveIds";
import { slugifyItemName } from "@/lib/routing/slugs";
import { buildItemSearchConditions } from "@/lib/item/search";
import { startItemMetadataRefresh, shelfMoveMetadataResetData } from "@/lib/jobs/scheduleMetadataRefresh";
import {
  itemPricesContextFromRecord,
  readItemPrices,
  summarizeListItemPrices,
  EMPTY_LIST_ITEM_PRICES,
} from "@/services/pricing/itemDisplay";

const VALID_SHELF_TYPES = new Set<string>(Object.values(Type));

function parseShelfTypesParam(value: string | null): {
  values?: Type[];
  invalid?: string[];
} {
  if (!value) return {};

  const requested = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = requested.filter((item) => !VALID_SHELF_TYPES.has(item));
  if (invalid.length > 0) return { invalid };

  return { values: requested as Type[] };
}

export async function GET(req: NextRequest) {
  return withRequestUiLocale(req, async () => {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;
  const isAdmin = auth.user.role === "admin";

  const searchParams = req.nextUrl.searchParams;
  const id = searchParams.get("id");
  const q = searchParams.get("q");
  const shelfId = searchParams.get("shelfId");
  const parsedExcludeShelfTypes = parseShelfTypesParam(
    searchParams.get("excludeShelfTypes"),
  );
  const parsedIncludeShelfTypes = parseShelfTypesParam(
    searchParams.get("shelfTypes"),
  );
  if (parsedExcludeShelfTypes.invalid || parsedIncludeShelfTypes.invalid) {
    return NextResponse.json(
      {
        error: "Invalid shelf type",
        invalidShelfTypes: [
          ...(parsedExcludeShelfTypes.invalid || []),
          ...(parsedIncludeShelfTypes.invalid || []),
        ],
      },
      { status: 400 },
    );
  }
  const excludeShelfTypes = parsedExcludeShelfTypes.values;
  const includeShelfTypes = parsedIncludeShelfTypes.values;
  const includeMetadata = searchParams.get("includeMetadata") !== "false"; // Par défaut true

  if (id) {
    const resolvedId = await resolveItemId(id, shelfId, auth.user.id);
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      include: {
        shelf: true,
        metadata: includeMetadata
          ? {
              include: {
                attachments: true,
                authors: true,
                publishers: true,
              },
            }
          : false,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // L'item appartient à l'utilisateur, est admin, ou se trouve dans une
    // étagère publique (consultation cross-user via collections partagées).
    if (!isAdmin && item.userId !== auth.user.id && !item.shelf.isPublic) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const prices = await readItemPrices(itemPricesContextFromRecord(item));
    return NextResponse.json({
      ...presentItemFromStorage(item),
      ...(prices ?? {
        priceNew: null,
        priceUsed: null,
        priceUsedCIB: null,
        priceLastUpdated: null,
      }),
    });
  }

  const whereClause: Prisma.ItemWhereInput = {};

  // Les listes/recherches sont restreintes aux items de l'utilisateur
  // (le cross-user public passe par /api/explore). L'admin voit tout.
  if (!isAdmin) {
    whereClause.userId = auth.user.id;
  }

  if (q) {
    whereClause.OR = buildItemSearchConditions(q);
  }

  if (shelfId) {
    whereClause.shelfId = await resolveShelfId(shelfId, auth.user.id);
  }

  if (excludeShelfTypes?.length || includeShelfTypes?.length) {
    whereClause.shelf = includeShelfTypes?.length
      ? { type: { in: includeShelfTypes } }
      : { type: { notIn: excludeShelfTypes! } };
  }

  const items = await prisma.item.findMany({
    where: whereClause,
    include: {
      shelf: true,
      metadata: includeMetadata
        ? {
            include: {
              attachments: true,
              authors: true,
              publishers: true,
            },
          }
        : false,
    },
    orderBy: { createdAt: "desc" },
  });

  if (includeMetadata) {
    const priceByItemId = await summarizeListItemPrices(items);
    return NextResponse.json(
      items.map((item) => ({
        ...presentItemFromStorage(item),
        ...(priceByItemId.get(item.id) ?? EMPTY_LIST_ITEM_PRICES),
      })),
    );
  }

  return NextResponse.json(items);
  });
}

export async function POST(req: NextRequest) {
  return withRequestUiLocale(req, async () => {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can create items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot create items" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const {
      shelfId,
      name,
      description,
      imageUrl,
      backgroundImageUrl,
      barcode,
      condition,
      fetchMetadata = true,
    } = body;
    if (typeof shelfId !== "string" || !shelfId.trim()) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
      );
    }

    const resolvedShelfId = await resolveShelfId(shelfId, auth.user.id);

    // Check if shelf exists and user has permission to add items to it
    const shelf = await prisma.shelf.findUnique({
      where: { id: resolvedShelfId },
      select: { type: true, userId: true, name: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    // Only allow if user is admin or the shelf owner
    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to add items to this shelf" },
        { status: 403 },
      );
    }

    let localImageUrl = imageUrl;
    let localBackgroundImageUrl = backgroundImageUrl;

    if (imageUrl) {
      localImageUrl = await downloadRemoteImage(imageUrl);
      if (localImageUrl) {
        localImageUrl = await cropImageIfNeeded(localImageUrl, {
          minMarginPixels: 30,
        });
      }
    }
    if (backgroundImageUrl) {
      localBackgroundImageUrl = await downloadRemoteImage(backgroundImageUrl);
    }

    const item = await prisma.item.create({
      data: {
        shelfId: resolvedShelfId,
        name,
        slug: slugifyItemName(name),
        description,
        imageUrl: localImageUrl,
        backgroundImageUrl: localBackgroundImageUrl,
        barcode,
        condition,
        userId: auth.user.id,
      },
      include: {
        shelf: true,
        metadata: {
          include: {
            attachments: true,
            authors: true,
            publishers: true,
          },
        },
      },
    });

    if (fetchMetadata) {
      await startItemMetadataRefresh({
        itemId: item.id,
        lookupQuery: name,
        shelfType: shelf.type,
        barcode,
        shelfName: shelf.name,
        bypassMetadataCache: false,
        forceRefresh: true,
      });
    }

    return NextResponse.json(presentItemFromStorage(item));
  } catch (error) {
    console.error("Error in POST request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
  });
}

export async function PATCH(req: NextRequest) {
  return withRequestUiLocale(req, async () => {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can update items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot update items" },
      { status: 403 },
    );
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const body = await req.json();
    const { id, refreshMetadata, lookupQuery, currentShelfId, ...data } = body;
    const requestId = typeof id === "string" ? id : searchParams.get("id");
    const sourceShelfId =
      typeof currentShelfId === "string"
        ? currentShelfId
        : searchParams.get("shelfId");

    if (!requestId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
      );
    }

    if (typeof data.name === "string") {
      data.slug = slugifyItemName(data.name);
    }
    if (typeof data.shelfId === "string") {
      data.shelfId = await resolveShelfId(data.shelfId, auth.user.id);
    }

    const resolvedId = await resolveItemId(
      requestId,
      sourceShelfId,
      auth.user.id,
    );

    // Check if item exists and user has permission to update it
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      select: {
        userId: true,
        shelfId: true,
        metadataId: true,
        name: true,
        barcode: true,
        imageUrl: true,
        backgroundImageUrl: true,
        shelf: { select: { type: true, name: true } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Only allow if user is admin or the item owner
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to update this item" },
        { status: 403 },
      );
    }

    const shelfChanged =
      typeof data.shelfId === "string" && data.shelfId !== item.shelfId;

    if (shelfChanged) {
      Object.assign(data, shelfMoveMetadataResetData(item, data));
    }

    if (data.imageUrl) {
      const previousImageUrl = item.imageUrl;
      data.imageUrl = await downloadRemoteImage(data.imageUrl);
      if (data.imageUrl) {
        data.imageUrl = await cropImageIfNeeded(data.imageUrl, {
          minMarginPixels: 30,
        });
      }
      if (
        data.imageUrl &&
        item.metadataId &&
        data.imageUrl !== previousImageUrl
      ) {
        await syncCroppedCoverAttachment(
          item.metadataId,
          data.imageUrl,
          previousImageUrl,
        );
      }
    }
    if (data.backgroundImageUrl) {
      data.backgroundImageUrl = await downloadRemoteImage(
        data.backgroundImageUrl,
      );
    }

    const updatedItem = await prisma.item.update({
      where: { id: resolvedId },
      data,
      include: {
        shelf: true,
        metadata: {
          include: {
            attachments: true,
            authors: true,
            publishers: true,
          },
        },
      },
    });

    if (typeof data.name === "string" && updatedItem.metadataId) {
      await prisma.metadata.update({
        where: { id: updatedItem.metadataId },
        data: { title: data.name },
      });
      if (updatedItem.metadata) {
        updatedItem.metadata.title = data.name;
      }
    }

    if (refreshMetadata || shelfChanged) {
      const metadataLookupQuery =
        typeof lookupQuery === "string" && lookupQuery.trim()
          ? lookupQuery.trim()
          : updatedItem.name;

      const metadataRefreshStartedAt = (
        await startItemMetadataRefresh({
          itemId: updatedItem.id,
          lookupQuery: metadataLookupQuery,
          shelfType: updatedItem.shelf.type,
          barcode: shelfChanged
            ? updatedItem.barcode || undefined
            : lookupQuery
              ? undefined
              : updatedItem.barcode || undefined,
          shelfName: updatedItem.shelf.name,
          clearRemoteCover: Boolean(
            updatedItem.imageUrl && updatedItem.imageUrl.startsWith("http"),
          ),
        })
      ).startedAt;

      const itemWithRefreshFlag = await prisma.item.findUnique({
        where: { id: updatedItem.id },
        include: {
          shelf: true,
          metadata: {
            include: {
              attachments: true,
              authors: true,
              publishers: true,
            },
          },
        },
      });

      return NextResponse.json(
        presentItemFromStorage({
          ...(itemWithRefreshFlag || updatedItem),
          metadataRefreshStartedAt,
        }),
      );
    }

    return NextResponse.json(presentItemFromStorage(updatedItem));
  } catch (error) {
    console.error("Error in PATCH request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can delete items
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot delete items" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const shelfId = searchParams.get("shelfId");

    if (!id) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 },
      );
    }

    const resolvedId = await resolveItemId(id, shelfId, auth.user.id);

    // Check if item exists and user has permission to delete it
    const item = await prisma.item.findUnique({
      where: { id: resolvedId },
      select: { userId: true },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Only allow if user is admin or the item owner
    if (auth.user.role !== "admin" && item.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this item" },
        { status: 403 },
      );
    }

    await prisma.item.delete({
      where: { id: resolvedId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
