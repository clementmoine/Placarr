import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import {
  BACKGROUND_WORK_KIND,
  enqueueBackgroundWorkJob,
  type BackgroundWorkKind,
} from "@/core/collect/jobs/workQueue";

export const maxDuration = 30;

const KIND_SPECS: Record<
  string,
  { kind: BackgroundWorkKind; label: string; hint: string }
> = {
  [BACKGROUND_WORK_KIND.icollectCatalogSync]: {
    kind: BACKGROUND_WORK_KIND.icollectCatalogSync,
    label: "iCollect catalog",
    hint: "Sync iCollect en file (worker catalog).",
  },
  [BACKGROUND_WORK_KIND.launchboxIndexSync]: {
    kind: BACKGROUND_WORK_KIND.launchboxIndexSync,
    label: "LaunchBox index",
    hint: "Build LaunchBox index en file (worker catalog).",
  },
  [BACKGROUND_WORK_KIND.nointroIndexSync]: {
    kind: BACKGROUND_WORK_KIND.nointroIndexSync,
    label: "No-Intro index",
    hint: "Build No-Intro index en file (worker catalog).",
  },
};

function normalizeKind(raw: string): BackgroundWorkKind | null {
  const key = raw.trim();
  if (key in KIND_SPECS) return KIND_SPECS[key]!.kind;
  return null;
}

/** Remap legacy Local-indexes kinds → unified Sync via module trait (no id literals). */
function moduleForLegacyWorkKind(kind: string): {
  providerId: string;
  label: string;
} | null {
  for (const mod of PROVIDER_MODULES) {
    if (mod.catalog?.legacyWorkKind === kind) {
      return {
        providerId: mod.info.id,
        label: mod.info.label,
      };
    }
  }
  return null;
}

/**
 * Admin: enqueue a local-index rebuild / catalog tick on the catalog worker.
 *
 * Preferred path (unified Sync): `{ kind: "catalogProviderSync", providerId }`
 * for modules with `catalog` hooks (LaunchBox, …).
 *
 * Legacy kinds still accepted and remapped when the module declares
 * `catalog.legacyWorkKind`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const throttle = consumeRateLimit(`catalog-index-sync:${auth.user.id}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: "Too many sync requests" },
      { status: 429 },
    );
  }

  const body = (await req.json()) as {
    kind?: string;
    target?: string;
    providerId?: string;
  };

  const rawKind = String(body.kind || body.target || "").trim();
  if (rawKind === BACKGROUND_WORK_KIND.catalogProviderSync) {
    const providerId = String(body.providerId || "").trim();
    if (!providerId) {
      return NextResponse.json(
        { error: "catalogProviderSync requires providerId" },
        { status: 400 },
      );
    }
    const job = await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      userId: auth.user.id,
      payload: {
        providerId,
        allowDownload: true,
        source: "admin",
      },
      replaceOpenForKind: true,
    });
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      providerId,
      label: `Catalogue Sync (${providerId})`,
      hint: "Unified Sync via ProviderModule.catalog.refresh",
    });
  }

  const legacy = moduleForLegacyWorkKind(rawKind);
  if (legacy) {
    const job = await enqueueBackgroundWorkJob({
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      userId: auth.user.id,
      payload: {
        providerId: legacy.providerId,
        allowDownload: true,
        source: "admin",
      },
      replaceOpenForKind: true,
    });
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      kind: BACKGROUND_WORK_KIND.catalogProviderSync,
      providerId: legacy.providerId,
      label: legacy.label,
      hint: `Unified Sync (catalogProviderSync → ${legacy.providerId}.catalog.refresh)`,
    });
  }

  const kind = normalizeKind(rawKind);
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "kind must be catalogProviderSync (+ providerId), launchboxIndexSync, icollectCatalogSync, or nointroIndexSync",
      },
      { status: 400 },
    );
  }

  const spec = KIND_SPECS[kind]!;
  const job = await enqueueBackgroundWorkJob({
    kind: spec.kind,
    userId: auth.user.id,
    payload: { allowDownload: true, source: "admin" },
    replaceOpenForKind: true,
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    kind: spec.kind,
    label: spec.label,
    hint: spec.hint,
  });
}
