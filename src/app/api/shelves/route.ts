import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

import { requireGuestOrHigher } from "@/lib/auth";
import { withRequestUiLocale } from "@/lib/locale/serverPreference";

import {
  itemListMetadataInclude,
  presentItemFromStorage,
  type StoredItemMetadata,
} from "@/lib/item/present";
import { seriesDisplayTitles } from "@/lib/title/series";
import { resolveShelfId } from "@/lib/routing/resolveIds";
import { slugify } from "@/lib/routing/slugs";
import { buildItemSearchConditions } from "@/lib/item/search";
import { bestRatingRatioFromFacts } from "@/lib/item/rating";
import { summarizeShelfItemPrices } from "@/services/pricing/resolver";
import type { ShelfBestItem } from "@/types/shelves";

const emptyShelfItemPrices = {
  priceNew: null,
  priceUsed: null,
  priceUsedCIB: null,
  priceLastUpdated: null,
} as const;

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
>(shelf: T) {
  const priceByItemId = await summarizeShelfItemPrices(
    shelf.type,
    shelf.items.map((item) => ({
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      metadataTitle: item.metadata?.title ?? null,
    })),
    shelf.name,
  );

  const items = shelf.items.map((item) => {
    const presented = presentItemFromStorage({
      ...item,
      metadata: (item.metadata ?? null) as StoredItemMetadata | null,
    });
    return {
      ...presented,
      id: item.id,
      ...(priceByItemId.get(item.id) ?? emptyShelfItemPrices),
    };
  });

  // Series-aware display padding: within this shelf, align each volume number to
  // the widest volume of its detected series (≥2 siblings sharing a base title).
  // Pure display projection — slugs/navigation unpad, so nothing here is stored.
  const seriesTitleById = seriesDisplayTitles(
    items.map((item) => ({ id: item.id, title: item.name ?? "" })),
  );

  return {
    ...shelf,
    items: items.map((item) => {
      const seriesTitle = seriesTitleById.get(item.id);
      return seriesTitle && seriesTitle !== item.name
        ? { ...item, name: seriesTitle }
        : item;
    }),
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
  return withRequestUiLocale(req, async () => {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const q = searchParams.get("q");

    if (id) {
      const resolvedId = await resolveShelfId(id, auth.user.id);
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

        // Only allow if user is admin or the owner
        if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        return NextResponse.json(await formatShelfWithItemPrices(shelf));
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
        return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
      }

      // Only allow if user is admin or the owner
      if (auth.user.role !== "admin" && shelf.userId !== auth.user.id) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      return NextResponse.json(await formatShelfWithItemPrices(shelf));
    }

    if (q) {
      const searchTerm = q.trim();

      const shelves = await prisma.shelf.findMany({
        where: {
          userId: auth.user.id,
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

      return NextResponse.json(await withBestItems(shelves));
    }

    const shelves = await prisma.shelf.findMany({
      where: {
        userId: auth.user.id,
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

    return NextResponse.json(await withBestItems(shelves));
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

    const { name, imageUrl, color, type } = body;

    const shelf = await prisma.shelf.create({
      data: {
        name,
        slug: slugify(name),
        imageUrl,
        color,
        type,
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
    const { id, ...data } = body;
    if (typeof data.name === "string") {
      data.slug = slugify(data.name);
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

    await prisma.shelf.delete({
      where: { id },
      include: {
        items: true,
      },
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
