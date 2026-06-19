import type { Capability, MediaType } from "@/types/providerRegistry";

export type CoverageRisk = "missing" | "single-source" | "ok" | "n/a";

export function computeCapabilityRisk(
  providerIds: string[],
  configuredProviderIds: string[],
): CoverageRisk {
  if (providerIds.length === 0) {
    return "n/a";
  }
  if (configuredProviderIds.length === 0) {
    return "missing";
  }
  if (configuredProviderIds.length === 1) {
    return "single-source";
  }
  return "ok";
}

export type CapabilityCoverageCell = {
  capability: Capability;
  providers: string[];
  configuredCount: number;
  risk: CoverageRisk;
};

export function buildCapabilityCoverageMatrix(
  types: MediaType[],
  capabilities: Capability[],
  capabilityCoverage: (
    type: MediaType,
    capability: Capability,
  ) => { providers: string[] },
  isConfigured: (providerId: string) => boolean,
): Array<{ type: MediaType; capabilities: CapabilityCoverageCell[] }> {
  return types.map((type) => ({
    type,
    capabilities: capabilities.map((capability) => {
      const { providers: ids } = capabilityCoverage(type, capability);
      const configuredIds = ids.filter(isConfigured);
      return {
        capability,
        providers: ids,
        configuredCount: configuredIds.length,
        risk: computeCapabilityRisk(ids, configuredIds),
      };
    }),
  }));
}
