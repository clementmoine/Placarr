import { getMetadata } from "@/services/metadata";
import { createBarcodeLookupDeps } from "@/services/providerBarcodeDeps";
import { PROVIDER_MODULES } from "@/services/providerRegistry";
import {
  createTeardownBarcodeTask,
  metadataTeardownLabel,
} from "@/lib/teardownUtils";

import type {
  BarcodeLookupDeps,
  BarcodeLookupType,
  TeardownBarcodeContext,
  TeardownMetadataContext,
  TeardownProviderTask,
} from "@/types/providerModule";

export type {
  TeardownBarcodeContext,
  TeardownMetadataContext,
  TeardownProviderTask,
  TeardownProviderTaskPhase,
} from "@/types/providerModule";

function buildFallbackBarcodeTeardownTasks(
  ctx: TeardownBarcodeContext,
  deps: BarcodeLookupDeps,
): TeardownProviderTask[] {
  if (!ctx.barcode) return [];

  const types: BarcodeLookupType[] = ctx.type
    ? [ctx.type as BarcodeLookupType]
    : ["games", "books", "musics", "movies", "boardgames", "generic"];

  const tasks: TeardownProviderTask[] = [];
  const seen = new Set<string>();

  for (const module of PROVIDER_MODULES) {
    if (module.buildTeardownBarcodeTasks || !module.buildBarcodeTasks) continue;

    for (const type of types) {
      const built = module.buildBarcodeTasks(deps, type, {
        barcode: ctx.barcode,
      });
      const promise = Object.values(built)[0];
      if (!promise) continue;

      const label = ctx.type
        ? module.info.label
        : `${module.info.label}:${type}`;
      if (seen.has(label)) continue;
      seen.add(label);

      tasks.push(createTeardownBarcodeTask(label, () => promise));
    }
  }

  return tasks;
}

export function buildTeardownBarcodeProviderTasks(
  params: TeardownBarcodeContext,
): TeardownProviderTask[] {
  const deps = createBarcodeLookupDeps();
  const customTasks = PROVIDER_MODULES.flatMap(
    (module) => module.buildTeardownBarcodeTasks?.(params, deps) ?? [],
  );

  return [...customTasks, ...buildFallbackBarcodeTeardownTasks(params, deps)];
}

export function buildTeardownMetadataProviderTasks(
  params: TeardownMetadataContext,
): TeardownProviderTask[] {
  if (!params.name) return [];

  const tasks = PROVIDER_MODULES.flatMap(
    (module) => module.buildTeardownMetadataTasks?.(params) ?? [],
  );

  tasks.push({
    providerLabel: metadataTeardownLabel("MergedEngine", params),
    phase: "merged",
    run: () =>
      getMetadata(params.name, params.type, params.barcode, params.platform),
  });

  return tasks;
}
