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
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";

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

  const targets = body.all
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

  // Granularity is for a single pack debug pass — not a bulk "refresh all".
  if (
    body.all &&
    (refreshOpts.only || refreshOpts.skip || refreshOpts.langs || refreshOpts.limit)
  ) {
    return NextResponse.json(
      { error: "only/skip/langs/limit require a single providerId" },
      { status: 400 },
    );
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
      },
      replaceOpenForKind: false,
    });
    jobs.push({
      providerId: mdl.info.id,
      jobId: job.id,
      label: mdl.info.label,
    });
  }

  return NextResponse.json({ ok: true, jobs });
}
