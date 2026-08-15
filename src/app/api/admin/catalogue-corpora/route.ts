import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import {
  discoverCatalogProviderModules,
  getCatalogProviderModule,
} from "@/core/catalog/catalog";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
} from "@/core/collect/jobs/workQueue";

export const maxDuration = 30;

/**
 * List refreshable local corpora (derived from ProviderModule.catalog).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const corpora = await Promise.all(
    discoverCatalogProviderModules().map(async (mdl) => {
      const status = await mdl.catalog!.status();
      return {
        providerId: mdl.info.id,
        label: mdl.info.label,
        dataPack: mdl.catalog!.dataPack,
        supplyMode: mdl.info.supplyMode ?? "api_live",
        status,
      };
    }),
  );

  return NextResponse.json({ corpora });
}

/**
 * Enqueue catalog refresh — one provider or all.
 * Body: `{ providerId?: string, all?: boolean, auto?: boolean }`
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

  const body = (await req.json()) as {
    providerId?: string;
    all?: boolean;
    auto?: boolean;
  };

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

  const jobs: { providerId: string; jobId: string; label: string }[] = [];
  for (const mdl of targets) {
    const job = await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      userId: auth.user.id,
      payload: {
        providerId: mdl.info.id,
        auto: Boolean(body.auto),
        source: "admin",
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
