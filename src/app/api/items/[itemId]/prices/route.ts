import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGuestOrHigher } from "@/lib/auth";
import { cleanCode } from "@/lib/barcode/query";
import { resolveItemId } from "@/lib/resolveIds";
import { shouldRefreshPriceCache } from "@/lib/priceCachePolicy";
import {
  emptyBarcodePrices,
  getCachedBarcodePrices,
  refreshBarcodePrices,
  type RefreshBarcodePricesInput,
} from "@/services/priceResolver";

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

    const cleanedBarcode = item.barcode ? cleanCode(item.barcode) : "";
    if (!cleanedBarcode) {
      return NextResponse.json(emptyBarcodePrices());
    }

    let aliases: string[] = [];
    if (item.metadata?.aliases) {
      try {
        aliases = JSON.parse(item.metadata.aliases);
      } catch (error) {
        console.warn("[API Prices] Failed to parse metadata aliases:", error);
      }
    }

    const refreshInput: RefreshBarcodePricesInput = {
      cleanedBarcode,
      shelfType: item.shelf.type,
      shelfName: item.shelf.name,
      primaryName: item.name,
      extraNames: [item.metadata?.title, ...aliases].filter(
        (name): name is string => !!name && name.trim().length > 0,
      ),
    };

    // Stale-while-revalidate: serve the cache immediately, refresh in the
    // background once it is too old. The refresh only merges fresher values in
    // (mergePriceOffers), so cached data is never lost on a failed provider.
    const cached = await getCachedBarcodePrices(
      cleanedBarcode,
      item.shelf.type,
      { itemId: item.id, metadataId: item.metadataId },
    );
    if (cached) {
      if (shouldRefreshPriceCache(item.shelf.type, cached)) {
        after(async () => {
          try {
            await refreshBarcodePrices(refreshInput);
          } catch (error) {
            console.error("[API Prices] Background refresh failed:", error);
          }
        });
      }
      return NextResponse.json(cached);
    }

    // Nothing cached yet — fetch synchronously so the first view has prices.
    const fresh = await refreshBarcodePrices(refreshInput);
    return NextResponse.json(fresh);
  } catch (error) {
    console.error(`[API Prices] Error handling request:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
