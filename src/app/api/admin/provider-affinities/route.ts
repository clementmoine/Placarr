import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import {
  PROVIDER_AFFINITY_CAPABILITIES,
  type ProviderAffinityCapability,
} from "@/core/catalog/providerAffinity";

export const maxDuration = 30;

/**
 * Admin: list learned provider affinities (catalogue-scoped successes).
 * Query: `?scopeKey=type:tcg&capability=price` (both optional).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const scopeKey = req.nextUrl.searchParams.get("scopeKey")?.trim() || null;
  const capabilityRaw =
    req.nextUrl.searchParams.get("capability")?.trim() || null;
  const capability =
    capabilityRaw &&
    (PROVIDER_AFFINITY_CAPABILITIES as readonly string[]).includes(
      capabilityRaw,
    )
      ? (capabilityRaw as ProviderAffinityCapability)
      : null;

  const rows = await prisma.providerAffinity.findMany({
    where: {
      ...(scopeKey ? { scopeKey } : {}),
      ...(capability ? { capability } : {}),
    },
    orderBy: [{ successCount: "desc" }, { lastAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    affinities: rows.map((row) => ({
      scopeKey: row.scopeKey,
      capability: row.capability,
      providerId: row.providerId,
      successCount: row.successCount,
      confidence: row.confidence,
      lastAt: row.lastAt.toISOString(),
    })),
  });
}
