import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import {
  CATALOGUE_EXTRACT_TARGETS,
  catalogueExtractLabel,
  normalizeCatalogueExtractScope,
  normalizeCatalogueExtractTarget,
} from "@/lib/admin/catalogueExtractRunner";
import { cataloguePackForExtractTarget } from "@/lib/admin/cataloguePacks";
import { beginCatalogueExtractLog } from "@/lib/admin/catalogueExtractLog";
import { catalogProviderIdsForDataPack } from "@/providers/shared/packOwner";

export const maxDuration = 60;

/**
 * Admin Sync for a catalogue extract target → unified
 * `catalogProviderSync` → `ProviderModule.catalog.refresh` (includes harvest,
 * faces, camera indexes). No product path enqueues bare `foilExtract` anymore;
 * in-flight legacy jobs still run via the worker.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

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
  const pack = cataloguePackForExtractTarget(target);
  if (!pack) {
    return NextResponse.json(
      { error: `No catalogue pack for extract target ${target}` },
      { status: 404 },
    );
  }

  const providerIds = catalogProviderIdsForDataPack(pack.id);
  if (providerIds.length === 0) {
    return NextResponse.json(
      {
        error: `No ProviderModule.catalog.refresh for dataPack ${pack.id}`,
      },
      { status: 404 },
    );
  }

  const jobs: { providerId: string; jobId: string }[] = [];
  for (const providerId of providerIds) {
    const job = await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      userId: auth.user.id,
      payload: {
        providerId,
        allowDownload: true,
        source: "admin",
        extractScope: scope,
      },
      replaceOpenForKind: true,
      replaceOpenPayloadMatch: { path: ["providerId"], equals: providerId },
    });
    jobs.push({ providerId, jobId: job.id });
  }

  // Keep the pack extract log as the UI Logs surface (same file as before).
  await beginCatalogueExtractLog(target, [
    `jobs=${jobs.map((j) => j.jobId).join(",")}`,
    `providers=${providerIds.join(",")}`,
    `scope=${scope}`,
    "status=queued",
    "via catalogProviderSync → catalog.refresh",
    "waiting for worker…",
  ]);

  return NextResponse.json({
    ok: true,
    jobId: jobs[0]!.jobId,
    jobs,
    target,
    scope,
    kind: BACKGROUND_WORK_KIND.catalogProviderSync,
    providerIds,
    label: catalogueExtractLabel(target),
    hint: `Sync file (${providerIds.join(", ")}) — catalog.refresh`,
  });
}
