import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { localizeMaskImage } from "@/core/enrich/media/maskDownload";
import { localizePrintMasks } from "@/core/enrich/media/localizePrintMasks";
import { listEffectPacks } from "@/effects";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import type { FoilPlayroomNeed } from "@/types/providerModule";

/**
 * How many masks to bake at once. Same ceiling as `/api/prints`: the publisher
 * rate-limits, and after the first pass every file is already on disk.
 */
const MASK_DOWNLOAD_CONCURRENCY = 4;

/**
 * Catalog prints that can illustrate every dumped foil material the playroom
 * knows about — used when the collection has no adapted copy for a finish.
 *
 * Masks are baked onto `/uploads/*.png` before the answer leaves: publisher
 * foil masks are JPEG coverage maps, and CSS `mask-mode: alpha` treats opaque
 * alpha as full-card coverage (the washed-out playroom look).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const needs: FoilPlayroomNeed[] = [];
  const seen = new Set<string>();
  for (const pack of listEffectPacks()) {
    const parse = pack.parseMaterialName;
    if (!parse) continue;
    for (const name of pack.listMaterials()) {
      const { finish, varnish } = parse(name);
      const key = `${finish ?? ""}|${varnish ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      needs.push({ finish, varnish });
    }
  }

  const samples = (
    await Promise.all(
      PROVIDER_MODULES.map(async (module) => {
        if (!module.suggestFoilPlayroomSamples) return [];
        return module.suggestFoilPlayroomSamples(needs);
      }),
    )
  ).flat();

  const localized = await localizePrintMasks(
    samples,
    ({ url, kind }) =>
      localizeMaskImage(url, { kind, signal: req.signal }),
    (items, worker) =>
      runWithConcurrency(items, MASK_DOWNLOAD_CONCURRENCY, worker, {
        signal: req.signal,
      }),
    { dropRemoteOnMiss: true },
  );

  return NextResponse.json({ samples: localized });
}
