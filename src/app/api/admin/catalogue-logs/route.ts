import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import {
  CATALOGUE_EXTRACT_TARGETS,
  normalizeCatalogueExtractTarget,
} from "@/lib/admin/catalogueExtractRunner";
import {
  readFoilExtractJobId,
  readCatalogueExtractLog,
} from "@/lib/admin/catalogueExtractLog";
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

  const pack = normalizeCatalogueExtractTarget(
    req.nextUrl.searchParams.get("pack")?.trim() ?? "",
  );
  if (!pack) {
    return NextResponse.json(
      { error: `pack must be one of: ${CATALOGUE_EXTRACT_TARGETS.join(", ")}` },
      { status: 400 },
    );
  }

  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
  const slice = await readCatalogueExtractLog(pack, {
    after: Number.isFinite(after) && after >= 0 ? after : 0,
  });

  let active: {
    id: string;
    status: string;
    startedAt: string;
    error?: string | null;
  } | null = null;
  try {
    // Prefer the jobId stamped in the current log — otherwise an older failed
    // row for the same pack pollutes Logs after a successful re-run.
    const logJobId = await readFoilExtractJobId(pack);
    if (logJobId) {
      const byId = await prisma.backgroundWorkJob.findUnique({
        where: { id: logJobId },
        select: {
          id: true,
          status: true,
          payload: true,
          lockedAt: true,
          createdAt: true,
          error: true,
        },
      });
      const target = normalizeCatalogueExtractTarget(
        (byId?.payload as { target?: unknown } | undefined)?.target,
      );
      if (byId && target === pack) {
        active = {
          id: byId.id,
          status: byId.status,
          startedAt: (byId.lockedAt ?? byId.createdAt).toISOString(),
          error: byId.error,
        };
      }
    }

    if (!active) {
      const openJobs = await prisma.backgroundWorkJob.findMany({
        where: {
          kind: BACKGROUND_WORK_KIND.catalogueExtract,
          status: {
            in: [
              BACKGROUND_WORK_STATUS.pending,
              BACKGROUND_WORK_STATUS.running,
            ],
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
          error: true,
        },
      });
      const match = openJobs.find((job) => {
        const target = normalizeCatalogueExtractTarget(
          (job.payload as { target?: unknown })?.target,
        );
        return target === pack;
      });
      if (match) {
        active = {
          id: match.id,
          status: match.status,
          startedAt: (match.lockedAt ?? match.createdAt).toISOString(),
          error: match.error,
        };
      }
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
