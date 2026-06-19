import { PROVIDER_MODULES } from "@/services/providerRegistry";

const INTERNAL_EVIDENCE: Record<
  string,
  {
    label: string;
    sourceWeight: number;
    canonical?: boolean;
    cleanCachedNames?: boolean;
  }
> = {
  DatabaseResolver: {
    label: "DatabaseResolver",
    sourceWeight: 0.34,
    canonical: true,
    cleanCachedNames: true,
  },
  DatabaseSuggestions: {
    label: "DatabaseSuggestions",
    sourceWeight: 0.26,
  },
};

const evidenceByLabel = new Map<
  string,
  {
    sourceWeight: number;
    canonical: boolean;
    cleanCachedNames: boolean;
  }
>();

for (const module of PROVIDER_MODULES) {
  if (!module.evidence) continue;
  evidenceByLabel.set(module.evidence.label, {
    sourceWeight: module.evidence.sourceWeight,
    canonical: module.evidence.canonical ?? module.info.canonical,
    cleanCachedNames: module.evidence.cleanCachedNames ?? false,
  });
}

for (const [label, config] of Object.entries(INTERNAL_EVIDENCE)) {
  evidenceByLabel.set(label, {
    sourceWeight: config.sourceWeight,
    canonical: config.canonical ?? false,
    cleanCachedNames: config.cleanCachedNames ?? false,
  });
}

export function getCanonicalProviderLabels(): string[] {
  return [...evidenceByLabel.entries()]
    .filter(([, config]) => config.canonical)
    .map(([label]) => label);
}

export function isCanonicalProvider(providerName: string): boolean {
  if (evidenceByLabel.get(providerName)?.canonical) return true;
  const normalized = providerName.toLowerCase();
  return getCanonicalProviderLabels().some((label) =>
    normalized.includes(label.toLowerCase()),
  );
}

export function sourceWeightForProvider(
  providerName: string,
  isAlias = false,
): number {
  const config = evidenceByLabel.get(providerName);
  const weight =
    config?.sourceWeight ?? (isCanonicalProvider(providerName) ? 0.36 : 0.08);
  return isAlias ? weight * 0.72 : weight;
}

export function isCleanCachedProvider(providerLabel: string): boolean {
  const normalized = providerLabel.toLowerCase();
  for (const [label, config] of evidenceByLabel.entries()) {
    if (config.cleanCachedNames && normalized.includes(label.toLowerCase())) {
      return true;
    }
  }
  return normalized.includes("databaseresolver");
}
