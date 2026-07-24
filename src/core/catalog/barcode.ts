import { PROVIDER_MODULES } from "./registry";
import {
  isBarcodeRecordSlimMode,
  shouldSkipBarcodeTaskInSlimRecord,
} from "@/core/identify/lookup/recordMode";

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
  for (const providerModule of PROVIDER_MODULES) {
    Object.assign(deps, providerModule.contributeBarcodeLookupDeps?.() ?? {});
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
    "hardware",
    "tcg",
    "toys",
    "generic",
  ];

  return Object.fromEntries(
    types.map((type) => [
      type,
      (context: BarcodeLookupContext) => {
        const slim = isBarcodeRecordSlimMode();
        return PROVIDER_MODULES.reduce<Record<string, Promise<unknown>>>(
          (tasks, providerModule) => {
            if (!providerModule.buildBarcodeTasks) return tasks;
            if (
              slim &&
              shouldSkipBarcodeTaskInSlimRecord(providerModule.info)
            ) {
              return tasks;
            }
            return {
              ...tasks,
              ...providerModule.buildBarcodeTasks(deps, type, context),
            };
          },
          {},
        );
      },
    ]),
  ) as Record<BarcodeLookupType, BarcodeLookupTaskBuilder>;
}

export function createGameBarcodeEnrichmentDeps(): GameBarcodeEnrichmentDeps {
  const deps: GameBarcodeEnrichmentDeps = {};
  for (const providerModule of PROVIDER_MODULES) {
    Object.assign(
      deps,
      providerModule.contributeGameBarcodeEnrichment?.() ?? {},
    );
  }
  return deps;
}
