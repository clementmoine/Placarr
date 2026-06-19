import { PROVIDER_MODULES } from "@/services/providerRegistry";

import type {
  BarcodeLookupContext,
  BarcodeLookupDeps,
  BarcodeLookupType,
} from "@/types/providerModule";

export type BarcodeLookupTaskBuilder = (
  context: BarcodeLookupContext,
) => Record<string, Promise<unknown>>;

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
            return { ...tasks, ...module.buildBarcodeTasks(deps, type, context) };
          },
          {},
        ),
    ]),
  ) as Record<BarcodeLookupType, BarcodeLookupTaskBuilder>;
}
