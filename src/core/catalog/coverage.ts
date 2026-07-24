import type {
  Capability,
  MediaType,
  ProviderAuth,
} from "@/types/providerRegistry";

export type CoverageRisk = "missing" | "single-source" | "ok" | "n/a";

export function computeCapabilityRisk(
  providerIds: string[],
  configuredProviderIds: string[],
  providerAuthKinds?: Map<string, ProviderAuth["kind"]>,
): CoverageRisk {
  if (providerIds.length === 0) {
    return "n/a";
  }
  if (configuredProviderIds.length === 0) {
    return "missing";
  }
  if (configuredProviderIds.length >= 2) {
    return "ok";
  }

  const authKinds =
    providerAuthKinds ?? new Map<string, ProviderAuth["kind"]>();
  const activeScrapeOrNone = providerIds.filter(
    (id) => authKinds.get(id) !== "key" && configuredProviderIds.includes(id),
  );
  const hasUnconfiguredKeyProvider = providerIds.some(
    (id) => authKinds.get(id) === "key" && !configuredProviderIds.includes(id),
  );

  if (activeScrapeOrNone.length >= 1 && hasUnconfiguredKeyProvider) {
    return "ok";
  }

  if (providerIds.length === 1) {
    return "ok";
  }

  return "single-source";
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
  providerAuthKinds?: Map<string, ProviderAuth["kind"]>,
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
        risk: computeCapabilityRisk(ids, configuredIds, providerAuthKinds),
      };
    }),
  }));
}
