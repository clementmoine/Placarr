import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { normalizeFoilExtractTarget } from "@/lib/admin/foilExtractRunner";
import { readFoilExtractLog } from "@/lib/admin/foilExtractLog";
import {
  BACKGROUND_WORK_KIND,
  BACKGROUND_WORK_STATUS,
} from "@/core/collect/jobs/workQueue";
import { prisma } from "@/lib/db/prisma";
import { dataRoot } from "@/lib/runtimeData";

/**
 * Tail foil extract log for a pack (``data/<pack>/logs/foil-extract.log``).
 * Poll with ``after=<nextOffset>`` for live follow.
 * When the log file is missing (older worker), fall back to foil-last-run.json.
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
  let slice = await readFoilExtractLog(pack, {
    after: Number.isFinite(after) && after >= 0 ? after : 0,
  });

  if (!slice.exists && after === 0) {
    const fallback = await readLastRunFallback(pack);
    if (fallback) slice = fallback;
  }

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

async function readLastRunFallback(pack: string): Promise<{
  exists: boolean;
  size: number;
  mtime: string | null;
  launchedAt: string | null;
  nextOffset: number;
  text: string;
} | null> {
  const lastRunPath = path.join(dataRoot(), pack, "foil-last-run.json");
  try {
    const raw = await readFile(lastRunPath, "utf8");
    const parsed = JSON.parse(raw) as {
      finishedAt?: string;
      results?: unknown[];
      pack?: string;
    };
    const finishedAt =
      typeof parsed.finishedAt === "string" ? parsed.finishedAt : null;
    const providers = Array.isArray(parsed.results)
      ? parsed.results
          .map((row) =>
            row && typeof row === "object" && "provider" in row
              ? String((row as { provider: unknown }).provider)
              : null,
          )
          .filter((name): name is string => Boolean(name))
      : [];
    const lines = [
      `── foil extract ${pack} (no live log — worker finished before tee)`,
      finishedAt ? `finishedAt=${finishedAt}` : null,
      providers.length > 0 ? `providers=${providers.join(",")}` : null,
      `source=${path.relative(dataRoot(), lastRunPath)}`,
      "",
      "Relance Extract pour un journal live (data/<pack>/logs/foil-extract.log).",
      "",
    ].filter((line): line is string => line != null);
    const text = `${lines.join("\n")}\n`;
    return {
      exists: true,
      size: text.length,
      mtime: finishedAt,
      launchedAt: finishedAt,
      nextOffset: text.length,
      text,
    };
  } catch {
    return null;
  }
}
