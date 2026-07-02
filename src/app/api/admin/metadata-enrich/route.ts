import { after, NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { fetchAndStoreMetadata } from "@/services/metadata";

import { PROVIDERS } from "@/services/provider/registry";

const DEFAULT_BATCH_LIMIT = 5;
const MAX_BATCH_LIMIT = 10;

// A game item counts as enriched once it has a cover from the primary canonical
// box-art source for games (the highest-weight real-box-cover provider). Derived
// from the registry — no hardcoded provider name.
function primaryGameCoverSource(): string | undefined {
  return PROVIDERS.filter(
    (p) => p.types.some((t) => t === "games") && p.isRealBoxCover,
  ).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0]?.id;
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

function scheduleAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch (error) {
    if (process.env.NODE_ENV === "test") return;
    console.warn(
      "[Admin Metadata Enrich] Falling back to timer scheduling",
      error,
    );
    const timer = setTimeout(() => {
      void task();
    }, 0);
    if (typeof timer.unref === "function") timer.unref();
  }
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

  scheduleAfterResponse(async () => {
    for (const item of items) {
      try {
        const lookupQuery = item.metadata?.title || item.name;
        await fetchAndStoreMetadata(
          item.id,
          lookupQuery,
          item.shelf.type,
          item.barcode || undefined,
          true,
          undefined,
          true,
          true,
          item.shelf.name,
        );
      } catch (error) {
        console.error(
          `[Admin Metadata Enrich] Failed to refresh ${item.id}:`,
          error,
        );
      }
    }
  });

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
