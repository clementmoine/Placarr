import type { BarcodeLookupSlotDefaults } from "@/core/identify/lookup/payload";

import { PROVIDER_MODULES } from "./registry";

/**
 * Slots core owns across providers: the retailer aggregate and the media-typed
 * fan-out of the single `cal` task. Everything provider-specific is declared by
 * the provider module itself (`barcodeLookupSlots` + `declare module`).
 */
const CORE_SLOT_DEFAULTS = {
  ol: () => null,
  mb: () => null,
  ss: () => null,
  pc: () => null,
  sd: () => null,
  retailers: () => [],
  amc: () => [],
  calFr: () => [],
  calDvd: () => [],
  calMusic: () => [],
  calToys: () => [],
  calJeuxVideo: () => [],
  calGeneric: () => [],
  leDenicheur: () => null,
  ice: () => null,
} satisfies Partial<BarcodeLookupSlotDefaults>;

/**
 * Empty value for every lookup slot: core's own plus each provider's.
 * The one place that needs the registry, so `payload.ts` stays importable by
 * provider modules without a cycle.
 */
export function barcodeLookupSlotDefaults(): BarcodeLookupSlotDefaults {
  const defaults: Record<string, () => unknown> = { ...CORE_SLOT_DEFAULTS };
  for (const providerModule of PROVIDER_MODULES) {
    Object.assign(defaults, providerModule.barcodeLookupSlots ?? {});
  }
  return defaults as unknown as BarcodeLookupSlotDefaults;
}
