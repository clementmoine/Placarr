import { NextRequest, NextResponse } from "next/server";
import { Type } from "@/generated/prisma/browser";
import { prisma } from "@/lib/db/prisma";

import {
  canReadOwnedRow,
  collectionUserIdFor,
  getCollectionOwnerId,
  requireGuestOrHigher,
} from "@/lib/auth";
import { withRequestUiLocale } from "@/core/locale/serverPreference";
import { isShelfTypeReady } from "@/lib/shelfTypeReadiness";

import type { MetadataResult } from "@/types/metadataProvider";
import {
  itemListMetadataInclude,
  presentItemFromStorage,
  type PresentedItem,
  type PresentableItemInput,
  type StoredItemMetadata,
} from "@/core/collect/present";
import { applySeriesDisplayNames } from "@/core/enrich/titles/series";
import { metadataAliases } from "@/core/enrich/aliases";
import { resolveShelfId } from "@/lib/routing/resolveIds";
import { reconcileDuplicateItemSlugsOnShelf } from "@/lib/routing/itemSlug";
import { slugify } from "@/lib/routing/slugs";
import { buildItemSearchConditions } from "@/core/collect/search";
import { bestRatingRatioFromFacts } from "@/core/collect/rating";
import { summarizeShelfItemPrices } from "@/core/commerce/pricing/resolver";
import {
  itemPricesContextFromPresentedShelfItem,
  shelfGridItemPriceFields,
} from "@/core/commerce/pricing/itemDisplay";
import { reconcileOrphanedMetadataRefreshesForUser } from "@/core/collect/jobs/metadataRefreshSession";
import type { Locale } from "@/types/i18n";
import type { ShelfBestItem } from "@/types/shelves";

async function formatShelfWithItemPrices<
  T extends {
    type: string;
    name: string;
    items: Array<
      {
        id: string;
        name: string;
        barcode?: string | null;
        metadataId?: string | null;
        metadata?: { title?: string | null; aliases?: string | null } | null;
      } & Record<string, unknown>
    >;
  },
>(shelf: T, uiLocale: Locale) {
  const priceByItemId = await summarizeShelfItemPrices(
    shelf.type,
    shelf.items.map((item) => ({
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      metadataTitle: item.metadata?.title ?? null,
      aliases: metadataAliases(item.metadata?.aliases) ?? null,
      printKey:
        typeof item.printKey === "string" ? item.printKey : null,
    })),
    shelf.name,
  );

  const items = applySeriesDisplayNames(
    shelf.items.map((item) => {
      const shelfContext = { type: shelf.type, name: shelf.name };
      const presented = presentItemFromStorage(
        {
          ...item,
          shelf: shelfContext,
          metadata: (item.metadata ?? null) as StoredItemMetadata | null,
        },
        { uiLocale },
      );
      const prices = shelfGridItemPriceFields(
        itemPricesContextFromPresentedShelfItem(
          {
            id: item.id,
            name: item.name,
            barcode: item.barcode,
            printKey:
              typeof item.printKey === "string" ? item.printKey : null,
            metadataId: item.metadataId,
            metadataRefreshStartedAt:
              "metadataRefreshStartedAt" in item
                ? (item.metadataRefreshStartedAt as
                    Date | string | null | undefined)
                : undefined,
            metadata: presented.metadata as MetadataResult | null | undefined,
          },
          shelfContext,
        ),
        priceByItemId.get(item.id) ?? null,
      );
      return {
        ...presented,
        id: item.id,
        ...prices,
      };
    }),
    { shelfType: shelf.type },
  ) as Array<
    PresentedItem<PresentableItemInput> & {
      id: string;
      priceNew: number | null;
      priceFoil?: number | null;
      priceUsed: number | null;
      priceUsedCIB: number | null;
      priceEstimated?: number | null;
      priceEstimatedFoil?: number | null;
      priceLastUpdated: Date | string | null;
    }
  >;

  return {
    ...shelf,
    items,
  };
}

/** Highest parseable rating ratio (0..1) across an item's rating facts, or -1. */
function bestRatingRatio(factsJson: string | null | undefined): number {
  if (!factsJson) return -1;
  try {
    const facts = JSON.parse(factsJson);
    if (!Array.isArray(facts)) return -1;
    return bestRatingRatioFromFacts(facts) ?? -1;
  } catch {
    return -1;
  }
}

/**
 * Attach each shelf's `bestItem` — the cover + background of its highest-rated
 * item that actually has a background to show. One extra query for the whole
 * list; ratings live in metadata.facts (JSON) so the pick happens in JS.
 */
async function withBestItems<T extends { id: string }>(
  shelves: T[],
): Promise<Array<T & { bestItem: ShelfBestItem | null }>> {
  if (shelves.length === 0) {
    return shelves.map((shelf) => ({ ...shelf, bestItem: null }));
  }

  const items = await prisma.item.findMany({
    where: { shelfId: { in: shelves.map((shelf) => shelf.id) } },
    select: {
      shelfId: true,
      imageUrl: true,
      backgroundImageUrl: true,
      metadata: {
        select: { imageUrl: true, heroImageUrl: true, facts: true },
      },
    },
  });

  const bestByShelf = new Map<string, ShelfBestItem & { ratio: number }>();
  for (const item of items) {
    const background =
      item.backgroundImageUrl ?? item.metadata?.heroImageUrl ?? null;
    const image = item.imageUrl ?? item.metadata?.imageUrl ?? null;
    if (!background && !image) continue;
    const ratio = bestRatingRatio(item.metadata?.facts);
    const current = bestByShelf.get(item.shelfId);
    if (!current || ratio > current.ratio) {
      bestByShelf.set(item.shelfId, {
        ratio,
        imageUrl: image,
        backgroundImageUrl: background,
      });
    }
  }

  return shelves.map((shelf) => {
    const best = bestByShelf.get(shelf.id);
    return {
      ...shelf,
      bestItem: best
        ? {
            imageUrl: best.imageUrl,
            backgroundImageUrl: best.backgroundImageUrl,
          }
        : null,
    };
  });
}

export async function GET(req: NextRequest) {
  return withRequestUiLocale(req, async (uiLocale) => {
    const auth = await requireGuestOrHigher(req);
    if (auth instanceof NextResponse) return auth;

    if (auth.user.role !== "guest") {
      await reconcileOrphanedMetadataRefreshesForUser(auth.user.id);
    }

    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get("id");
      const q = searchParams.get("q");
      const lite = searchParams.get("lite") === "1";
      const scopeUserId = await collectionUserIdFor(auth.user);
      const collectionOwnerId =
        auth.user.role === "guest" ? scopeUserId : await getCollectionOwnerId();

      if (id) {
        const resolvedId = await resolveShelfId(id, scopeUserId);
        if (q) {
          const searchTerm = q.trim();
          const shelf = await prisma.shelf.findUnique({
            where: { id: resolvedId },
            include: {
              items: {
                where: {
                  OR: buildItemSearchConditions(searchTerm),
                },
                include: {
                  metadata: itemListMetadataInclude,
                },
                orderBy: { name: "asc" },
              },
            },
          });

          if (!shelf) {
            return NextResponse.json(
              { error: "Shelf not found" },
              { status: 404 },
            );
          }

          if (!canReadOwnedRow(auth.user, shelf.userId, collectionOwnerId)) {
            return NextResponse.json(
              { error: "Access denied" },
              { status: 403 },
            );
          }

          await reconcileDuplicateItemSlugsOnShelf(shelf.id);
          const refreshedShelf = await prisma.shelf.findUnique({
            where: { id: resolvedId },
            include: {
              items: {
                where: {
                  OR: buildItemSearchConditions(searchTerm),
                },
                include: {
                  metadata: itemListMetadataInclude,
                },
                orderBy: { name: "asc" },
              },
            },
          });

          const formatted = await formatShelfWithItemPrices(
            refreshedShelf ?? shelf,
            uiLocale,
          );
          const [withBest] = await withBestItems([{ id: formatted.id }]);
          return NextResponse.json({
            ...formatted,
            bestItem: withBest.bestItem,
          });
        }

        const shelf = await prisma.shelf.findUnique({
          where: { id: resolvedId },
          include: {
            items: {
              include: {
                metadata: itemListMetadataInclude,
              },
              orderBy: { name: "asc" },
            },
          },
        });

        if (!shelf) {
          return NextResponse.json(
            { error: "Shelf not found" },
            { status: 404 },
          );
        }

        if (!canReadOwnedRow(auth.user, shelf.userId, collectionOwnerId)) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        await reconcileDuplicateItemSlugsOnShelf(shelf.id);
        const refreshedShelf = await prisma.shelf.findUnique({
          where: { id: resolvedId },
          include: {
            items: {
              include: {
                metadata: itemListMetadataInclude,
              },
              orderBy: { name: "asc" },
            },
          },
        });

        const formatted = await formatShelfWithItemPrices(
          refreshedShelf ?? shelf,
          uiLocale,
        );
        const [withBest] = await withBestItems([{ id: formatted.id }]);
        return NextResponse.json({
          ...formatted,
          bestItem: withBest.bestItem,
        });
      }

      if (q) {
        const searchTerm = q.trim();

        const shelves = await prisma.shelf.findMany({
          where: {
            userId: scopeUserId,
            OR: [
              { name: { contains: searchTerm, mode: "insensitive" } },
              {
                items: {
                  some: {
                    OR: buildItemSearchConditions(searchTerm),
                  },
                },
              },
            ],
          },
          include: {
            _count: {
              select: {
                items: true,
              },
            },
          },
          orderBy: {
            name: "asc",
          },
        });

        return NextResponse.json(lite ? shelves : await withBestItems(shelves));
      }

      const shelves = await prisma.shelf.findMany({
        where: {
          userId: scopeUserId,
        },
        include: {
          _count: {
            select: {
              items: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      return NextResponse.json(lite ? shelves : await withBestItems(shelves));
    } catch (error) {
      console.error("Error in GET request:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can create shelves
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot create shelves" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();

    const { name, imageUrl, color, type, cardFormat } = body;

    if (
      typeof type !== "string" ||
      !(Object.values(Type) as string[]).includes(type) ||
      !isShelfTypeReady(type)
    ) {
      return NextResponse.json(
        { error: "Shelf type is not available yet" },
        { status: 400 },
      );
    }

    const shelf = await prisma.shelf.create({
      data: {
        name,
        slug: slugify(name),
        imageUrl,
        color,
        type: type as Type,
        ...(typeof cardFormat === "string" && cardFormat.trim()
          ? { cardFormat: cardFormat.trim() }
          : {}),
        userId: auth.user.id,
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(shelf);
  } catch (error) {
    console.error("Error in POST request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can update shelves
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot update shelves" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { id } = body;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
      );
    }

    const data: {
      name?: string;
      slug?: string;
      imageUrl?: string | null;
      color?: string | null;
      type?: Type;
      cardFormat?: string;
    } = {};
    if (typeof body.name === "string") {
      data.name = body.name;
      data.slug = slugify(body.name);
    }
    if (
      "imageUrl" in body &&
      (typeof body.imageUrl === "string" || body.imageUrl === null)
    ) {
      data.imageUrl = body.imageUrl;
    }
    if (
      "color" in body &&
      (typeof body.color === "string" || body.color === null)
    ) {
      data.color = body.color;
    }
    if (
      typeof body.type === "string" &&
      (Object.values(Type) as string[]).includes(body.type)
    ) {
      if (!isShelfTypeReady(body.type)) {
        return NextResponse.json(
          { error: "Shelf type is not available yet" },
          { status: 400 },
        );
      }
      data.type = body.type as Type;
    }
    if (typeof body.cardFormat === "string" && body.cardFormat.trim()) {
      data.cardFormat = body.cardFormat.trim();
    }

    // Check if shelf exists and user has permission to update it
    const shelf = await prisma.shelf.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    // Only allow if user is admin or the owner
    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to update this shelf" },
        { status: 403 },
      );
    }

    const updatedShelf = await prisma.shelf.update({
      where: { id },
      data,
      include: {
        items: true,
      },
    });

    return NextResponse.json(updatedShelf);
  } catch (error) {
    console.error("Error in PATCH request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  // Only admin and regular users can delete shelves
  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot delete shelves" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Shelf ID is required" },
        { status: 400 },
      );
    }

    // Check if shelf exists and user has permission to delete it
    const shelf = await prisma.shelf.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!shelf) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }

    // Only allow if user is admin or the owner
    if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
      return NextResponse.json(
        { error: "You don't have permission to delete this shelf" },
        { status: 403 },
      );
    }

    const itemCount = await prisma.item.count({ where: { shelfId: id } });
    if (itemCount > 0) {
      return NextResponse.json(
        {
          error: "Shelf is not empty",
          code: "SHELF_NOT_EMPTY",
          itemCount,
        },
        { status: 409 },
      );
    }

    await prisma.shelf.delete({
      where: { id },
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
