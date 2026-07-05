import { getMetadata } from "@/core/metadata";
import { createBarcodeLookupDeps } from "@/core/catalog/barcode";
import { PROVIDER_MODULES } from "./registry";
import {
  createTeardownBarcodeTask,
  metadataTeardownLabel,
} from "@/lib/dev/teardownUtils";

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

  for (const providerModule of PROVIDER_MODULES) {
    if (
      providerModule.buildTeardownBarcodeTasks ||
      !providerModule.buildBarcodeTasks
    )
      continue;

    for (const type of types) {
      const built = providerModule.buildBarcodeTasks(deps, type, {
        barcode: ctx.barcode,
      });
      const promise = Object.values(built)[0];
      if (!promise) continue;

      const label = ctx.type
        ? providerModule.info.label
        : `${providerModule.info.label}:${type}`;
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
    (providerModule) =>
      providerModule.buildTeardownBarcodeTasks?.(params, deps) ?? [],
  );

  return [...customTasks, ...buildFallbackBarcodeTeardownTasks(params, deps)];
}

export function buildTeardownMetadataProviderTasks(
  params: TeardownMetadataContext,
): TeardownProviderTask[] {
  if (!params.name) return [];

  const tasks = PROVIDER_MODULES.flatMap(
    (providerModule) =>
      providerModule.buildTeardownMetadataTasks?.(params) ?? [],
  );

  tasks.push({
    providerLabel: metadataTeardownLabel("MergedEngine", params),
    phase: "merged",
    run: () =>
      getMetadata(params.name, params.type, params.barcode, params.platform),
  });

  return tasks;
}
