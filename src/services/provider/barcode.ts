import { PROVIDER_MODULES } from "@/services/provider/registry";

import type {
  BarcodeLookupContext,
  BarcodeLookupDeps,
  BarcodeLookupType,
  GameBarcodeEnrichmentDeps,
} from "@/types/providerModule";

export type BarcodeLookupTaskBuilder = (
  context: BarcodeLookupContext,
) => Record<string, Promise<unknown>>;

export function createBarcodeLookupDeps(): BarcodeLookupDeps {
  const deps = {} as BarcodeLookupDeps;
  for (const module of PROVIDER_MODULES) {
    Object.assign(deps, module.contributeBarcodeLookupDeps?.() ?? {});
  }
  return deps;
}

export function createBarcodeLookupTaskBuilders(
  deps: BarcodeLookupDeps,
): Record<BarcodeLookupType, BarcodeLookupTaskBuilder> {
  const types: BarcodeLookupType[] = [
    "games",
    "books",
    "musics",
    "movies",
    "boardgames",
    "generic",
  ];

  return Object.fromEntries(
    types.map((type) => [
      type,
      (context: BarcodeLookupContext) =>
        PROVIDER_MODULES.reduce<Record<string, Promise<unknown>>>(
          (tasks, module) => {
            if (!module.buildBarcodeTasks) return tasks;
            return {
              ...tasks,
              ...module.buildBarcodeTasks(deps, type, context),
            };
          },
          {},
        ),
    ]),
  ) as Record<BarcodeLookupType, BarcodeLookupTaskBuilder>;
}

export function createGameBarcodeEnrichmentDeps(): GameBarcodeEnrichmentDeps {
  const deps: GameBarcodeEnrichmentDeps = {};
  for (const module of PROVIDER_MODULES) {
    Object.assign(deps, module.contributeGameBarcodeEnrichment?.() ?? {});
  }
  return deps;
}
