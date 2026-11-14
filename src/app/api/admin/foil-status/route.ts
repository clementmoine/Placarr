import path from "node:path";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { computeFoilGaps } from "@/lib/admin/foilGaps";
import { readFoilPackStatuses } from "@/lib/admin/foilStatus";
import { dataRoot } from "@/lib/runtimeData";

/**
 * Admin snapshot: APKs on disk + extract freshness + integration gaps.
 *
 * Auto-sync is started by the catalog worker only — polling this route used
 * to enqueue stale corpora from the Next process with no claimer attached.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const root = dataRoot();
  const packs = await readFoilPackStatuses({
    dataRoot: root,
    repoRoot: path.dirname(root),
  });
  const gaps = computeFoilGaps();

  return NextResponse.json({ packs, gaps });
}
