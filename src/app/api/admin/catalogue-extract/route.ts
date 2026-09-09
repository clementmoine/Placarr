import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import {
  CATALOGUE_EXTRACT_TARGETS,
  catalogueExtractLabel,
  normalizeCatalogueExtractScope,
  normalizeCatalogueExtractTarget,
  resolveCatalogueExtractCommand,
} from "@/lib/admin/catalogueExtractRunner";
import { beginCatalogueExtractLog } from "@/lib/admin/catalogueExtractLog";

export const maxDuration = 60;

/**
 * Admin: enqueue a durable catalogue extract on the interactive worker.
 * Survives leaving the admin page — progress shows in the header
 * background-jobs menu. In-process Node (no CLI).
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

  const body = (await req.json()) as { target?: string; scope?: string };
  const target = normalizeCatalogueExtractTarget(
    String(body.target || "").trim(),
  );
  if (!target) {
    return NextResponse.json(
      {
        error: `target must be ${CATALOGUE_EXTRACT_TARGETS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const scope = normalizeCatalogueExtractScope(body.scope);

  // Validate paths before enqueue so the UI gets a fast error.
  try {
    await resolveCatalogueExtractCommand(target, { scope });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 404 },
    );
  }

  const job = await enqueueBackgroundWorkJob({
    kind: BACKGROUND_WORK_KIND.catalogueExtract,
    userId: auth.user.id,
    payload: { target, scope },
    // Replace this pack's own run, not the neighbours': every extract shares
    // the kind `foilExtract`, so an unrestricted sweep cancelled a running
    // Lorcana pass when a Pokémon one was queued seconds later.
    replaceOpenForKind: true,
    replaceOpenPayloadMatch: { path: ["target"], equals: target },
  });

  // Seed the pack log immediately so Logs opens with “queued” before the
  // worker claims the job (and even if an old worker process lacks tee).
  await beginCatalogueExtractLog(target, [
    `jobId=${job.id}`,
    "status=queued",
    "waiting for worker…",
  ]);

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    target,
    scope,
    kind: BACKGROUND_WORK_KIND.catalogueExtract,
    label: catalogueExtractLabel(target),
    hint:
      target === "pokemon"
        ? scope === "catalogue"
          ? "Catalogue complet en file d’attente : ~93k bundles, plusieurs heures. Tu peux quitter la page."
          : "Sync Pokémon en file d’attente (worker). Tu peux quitter la page."
        : `Sync ${catalogueExtractLabel(target)} en file d’attente (worker). Tu peux quitter la page.`,
  });
}
