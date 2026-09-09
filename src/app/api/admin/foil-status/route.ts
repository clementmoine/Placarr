import path from "node:path";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { startFoilCatalogSyncLoop } from "@/lib/admin/foilCatalogSync";
import { computeFoilGaps } from "@/lib/admin/foilGaps";
import { readFoilPackStatuses } from "@/lib/admin/foilStatus";
import { dataRoot } from "@/lib/runtimeData";

/**
 * Admin snapshot: APKs on disk + extract freshness + integration gaps.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  startFoilCatalogSyncLoop();

  const root = dataRoot();
  const packs = await readFoilPackStatuses({
    dataRoot: root,
    repoRoot: path.dirname(root),
  });
  const gaps = computeFoilGaps();

  return NextResponse.json({ packs, gaps });
}
