import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { listEffectPacks } from "@/effects";
import type { FoilPlayroomNeed } from "@/types/providerModule";

/**
 * Catalog prints that can illustrate every dumped foil material the playroom
 * knows about — used when the collection has no adapted copy for a finish.
 */
export async function GET() {
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

  return NextResponse.json({ samples });
}
