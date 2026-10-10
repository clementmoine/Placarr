import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/browser";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { startItemMetadataRefresh } from "@/core/collect/jobs/scheduleMetadataRefresh";

import { PROVIDERS } from "@/core/catalog/catalog";

const DEFAULT_BATCH_LIMIT = 10;
const MAX_BATCH_LIMIT = 25;

// A game item counts as enriched once it has a cover from the primary canonical
// box-art source for games: the first canonical real-box-cover provider in the
// registry. Trait-scoped, no hardcoded provider name, no weight knob.
function primaryGameCoverSource(): string | undefined {
  return PROVIDERS.filter(
    (p) =>
      p.types.some((t) => t === "games") && p.isRealBoxCover && p.canonical,
  )[0]?.id;
}

function metadataEnrichmentWhere(): Prisma.ItemWhereInput {
  const source = primaryGameCoverSource();
  return {
    shelf: { type: "games" },
    OR: [
      { metadataId: null },
      ...(source ? [{ metadata: { attachments: { none: { source } } } }] : []),
    ],
  };
}

function parseBatchLimit(req: NextRequest): number {
  const rawLimit = req.nextUrl.searchParams.get("limit");
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : DEFAULT_BATCH_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_LIMIT;
  return Math.min(parsed, MAX_BATCH_LIMIT);
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const items = await prisma.item.findMany({
    where: metadataEnrichmentWhere(),
    select: {
      id: true,
      name: true,
      barcode: true,
      shelf: {
        select: {
          name: true,
          type: true,
        },
      },
      metadata: {
        select: {
          title: true,
          lastFetched: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    total: items.length,
    items,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const limit = parseBatchLimit(req);
  const items = await prisma.item.findMany({
    where: metadataEnrichmentWhere(),
    include: {
      shelf: true,
      metadata: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  // Stamp + enqueue only: two small writes per item. The pace of the actual
  // enrichment is the background I/O pool's job (BACKGROUND_IO_CONCURRENCY) —
  // throttling the enqueue loop as well only slowed the admin response down.
  for (const item of items) {
    try {
      const lookupQuery = item.metadata?.title || item.name;
      await startItemMetadataRefresh({
        itemId: item.id,
        lookupQuery,
        shelfType: item.shelf.type,
        barcode: item.barcode,
        shelfName: item.shelf.name,
        bypassMetadataCache: false,
        forceRefresh: true,
        userId: item.userId,
      });
    } catch (error) {
      console.error(
        `[Admin Metadata Enrich] Failed to enqueue refresh for ${item.id}:`,
        error,
      );
    }
  }

  return NextResponse.json(
    {
      acceptedCount: items.length,
      itemIds: items.map((item) => item.id),
      limit,
      queuedAt: new Date().toISOString(),
    },
    { status: 202 },
  );
}
