import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { presentItemFromStorage } from "@/lib/item/present";
import { buildItemSearchConditions } from "@/lib/item/search";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");

    if (q) {
      const searchTerm = q.trim();

      // Search for items in public shelves belonging to other users
      const items = await prisma.item.findMany({
        where: {
          userId: { not: auth.user.id },
          shelf: {
            isPublic: true,
          },
          OR: buildItemSearchConditions(searchTerm),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          shelf: {
            select: {
              id: true,
              name: true,
              color: true,
              type: true,
            },
          },
          metadata: {
            include: {
              attachments: true,
              authors: true,
              publishers: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      // Format items metadata
      const formattedItems = items.map((item) => {
        if (item.metadata) {
          return presentItemFromStorage(item);
        }
        return item;
      });

      return NextResponse.json(formattedItems);
    }

    // If no query q is provided, browse public shelves of other users with item counts and owner details
    const publicShelves = await prisma.shelf.findMany({
      where: {
        isPublic: true,
        userId: { not: auth.user.id },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
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

    return NextResponse.json(publicShelves);
  } catch (error) {
    console.error("Error in explore GET route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
