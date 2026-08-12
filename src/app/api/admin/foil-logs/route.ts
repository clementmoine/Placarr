import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { normalizeFoilExtractTarget } from "@/lib/admin/foilExtractRunner";
import { readFoilExtractLog } from "@/lib/admin/foilExtractLog";
import {
  BACKGROUND_WORK_KIND,
  BACKGROUND_WORK_STATUS,
} from "@/core/collect/jobs/workQueue";
import { prisma } from "@/lib/db/prisma";

/**
 * Tail foil extract log for a pack (``data/<pack>/logs/foil-extract.log``).
 * Poll with ``after=<nextOffset>`` for live follow.
 * Missing log → honest empty slice (no last-run.json substitute).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const pack = normalizeFoilExtractTarget(
    req.nextUrl.searchParams.get("pack")?.trim() ?? "",
  );
  if (!pack) {
    return NextResponse.json(
      { error: "pack must be lorcana or pokemon" },
      { status: 400 },
    );
  }

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
  const slice = await readFoilExtractLog(pack, {
    after: Number.isFinite(after) && after >= 0 ? after : 0,
  });

  let active: {
    id: string;
    status: string;
    startedAt: string;
  } | null = null;
  try {
    const openJobs = await prisma.backgroundWorkJob.findMany({
      where: {
        kind: BACKGROUND_WORK_KIND.foilExtract,
        status: {
          in: [BACKGROUND_WORK_STATUS.pending, BACKGROUND_WORK_STATUS.running],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        payload: true,
        lockedAt: true,
        createdAt: true,
      },
    });
    const match = openJobs.find((job) => {
      const target = normalizeFoilExtractTarget(
        (job.payload as { target?: unknown })?.target,
      );
      return target === pack;
    });
    if (match) {
      active = {
        id: match.id,
        status: match.status,
        startedAt: (match.lockedAt ?? match.createdAt).toISOString(),
      };
    }
  } catch {
    /* listing jobs must not blank the log tail */
  }

  return NextResponse.json({
    pack,
    ...slice,
    job: active,
  });
}
