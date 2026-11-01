import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { catalogRefreshOptsFromPayload } from "@/lib/admin/catalogRefreshOpts";
import {
  cataloguePackInfo,
  resolveCataloguePackId,
} from "@/lib/admin/cataloguePacks";
import {
  discoverCatalogProviderModules,
  getCatalogProviderModule,
} from "@/core/catalog/catalog";
import { cardIdentifyIndexStatus } from "@/core/identify/cardIdentifyIndexStatus";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";
import { isIdentifyOnlyRefresh } from "@/providers/shared/cardCatalogue/pipeline";
import type { Prisma } from "@/generated/prisma/client";

export const maxDuration = 30;

function pipelineStepsForDataPack(dataPack: string): string[] | undefined {
  const pack = cataloguePackInfo(resolveCataloguePackId(dataPack));
  const steps = pack?.extract?.pipelineSteps;
  return steps?.length ? [...steps] : undefined;
}

/**
 * List refreshable local corpora (derived from ProviderModule.catalog).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const corpora = await Promise.all(
    discoverCatalogProviderModules().map(async (mdl) => {
      const status = await mdl.catalog!.status();
      const dataPack = mdl.catalog!.dataPack;
      return {
        providerId: mdl.info.id,
        label: mdl.info.label,
        dataPack,
        supplyMode: mdl.info.supplyMode ?? "api_live",
        status,
        pipelineSteps: pipelineStepsForDataPack(dataPack) ?? null,
        identifyIndexes: cardIdentifyIndexStatus(dataPack),
      };
    }),
  );

  return NextResponse.json({ corpora });
}

/**
 * Enqueue catalog refresh — one provider or all.
 * Body: `{ providerId?, all?, auto?, only?, skip?, langs?, limit? }`
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const throttle = consumeRateLimit(`catalogue-corpora:${auth.user.id}`, {
    limit: 12,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many sync requests" },
      { status: 429 },
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const refreshOpts = catalogRefreshOptsFromPayload(body);
  const identifyOnly = isIdentifyOnlyRefresh(refreshOpts.only);
  const missingEmbeddingsOnly = Boolean(body.missingEmbeddingsOnly);

  let targets = body.all
    ? discoverCatalogProviderModules()
    : (() => {
        const id = String(body.providerId || "").trim();
        const mdl = id ? getCatalogProviderModule(id) : undefined;
        return mdl ? [mdl] : [];
      })();

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "providerId required (or all: true)" },
      { status: 400 },
    );
  }

  // Bulk identify rebuild is allowed (camera indexes). Other granularity
  // stays single-provider so a debug --only faces pass does not fan out.
  if (
    body.all &&
    (refreshOpts.only || refreshOpts.skip || refreshOpts.langs || refreshOpts.limit) &&
    !identifyOnly
  ) {
    return NextResponse.json(
      { error: "only/skip/langs/limit require a single providerId" },
      { status: 400 },
    );
  }

  if (body.all && identifyOnly && missingEmbeddingsOnly) {
    targets = targets.filter((mdl) => {
      const dataPack = mdl.catalog?.dataPack;
      if (!dataPack) return false;
      return cardIdentifyIndexStatus(dataPack).embeddingsStale;
    });
    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        jobs: [],
        hint: "all camera embedding indexes are fresh",
      });
    }
  }

  const jobs: { providerId: string; jobId: string; label: string }[] = [];
  for (const mdl of targets) {
    const job = await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      userId: auth.user.id,
      payload: {
        providerId: mdl.info.id,
        source: "admin",
        ...refreshOpts,
      } as unknown as Prisma.InputJsonValue,
      replaceOpenForKind: true,
      replaceOpenPayloadMatch: {
        path: ["providerId"],
        equals: mdl.info.id,
      },
    });
    jobs.push({
      providerId: mdl.info.id,
      jobId: job.id,
      label: mdl.info.label,
    });
  }

  return NextResponse.json({ ok: true, jobs });
}
