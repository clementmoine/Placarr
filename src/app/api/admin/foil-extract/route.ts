import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import {
  foilExtractLabel,
  normalizeFoilExtractTarget,
  resolveFoilExtractCommand,
} from "@/lib/admin/foilExtractRunner";
import { beginFoilExtractLog } from "@/lib/admin/foilExtractLog";

export const maxDuration = 60;

/**
 * Admin: enqueue a durable foil extract on the interactive worker
 * (`pnpm worker`). Survives leaving the admin page — progress shows in the
 * header background-jobs menu.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const throttle = consumeRateLimit(`foil-extract:${auth.user.id}`, {
    limit: 3,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Too many extracts" }, { status: 429 });
  }

  const body = (await req.json()) as { target?: string };
  const target = normalizeFoilExtractTarget(String(body.target || "").trim());
  if (!target) {
    return NextResponse.json(
      { error: "target must be lorcana or pokemon" },
      { status: 400 },
    );
  }

  // Validate paths before enqueue so the UI gets a fast error.
  try {
    await resolveFoilExtractCommand(target);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 404 },
    );
  }

  const job = await enqueueBackgroundWorkJob({
    kind: BACKGROUND_WORK_KIND.foilExtract,
    userId: auth.user.id,
    payload: { target },
    replaceOpenForKind: true,
  });

  // Seed the pack log immediately so Logs opens with “queued” before the
  // worker claims the job (and even if an old worker process lacks tee).
  await beginFoilExtractLog(target, [
    `jobId=${job.id}`,
    "status=queued",
    "waiting for worker…",
  ]);

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    target,
    kind: BACKGROUND_WORK_KIND.foilExtract,
    label: foilExtractLabel(target),
    hint:
      target === "pokemon"
        ? "Extract Pokémon en file d’attente (worker). Tu peux quitter la page."
        : "Extract Lorcana en file d’attente (worker). Tu peux quitter la page.",
  });
}
