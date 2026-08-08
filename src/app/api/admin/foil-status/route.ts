import path from "node:path";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { readFoilPackStatuses } from "@/lib/admin/foilStatus";
import { dataRoot } from "@/lib/runtimeData";

/**
 * Admin snapshot: APKs on disk + whether foil extract looks current.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const root = dataRoot();
  const packs = await readFoilPackStatuses({
    dataRoot: root,
    repoRoot: path.dirname(root),
  });

  return NextResponse.json({ packs });
}
