import { PROVIDER_MODULES } from "@/services/providerRegistry";

const INTERNAL_EVIDENCE: Record<
  string,
  {
    label: string;
    sourceWeight: number;
    canonical?: boolean;
    trustedRetailer?: boolean;
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

type ProviderEvidenceProfile = {
  sourceWeight: number;
  canonical: boolean;
  trustedRetailer: boolean;
  cleanCachedNames: boolean;
};

const evidenceByLabel = new Map<string, ProviderEvidenceProfile>();

for (const module of PROVIDER_MODULES) {
  if (!module.evidence) continue;
  evidenceByLabel.set(module.evidence.label, {
    sourceWeight: module.evidence.sourceWeight,
    canonical: module.evidence.canonical ?? module.info.canonical,
    trustedRetailer: module.evidence.trustedRetailer ?? false,
    cleanCachedNames: module.evidence.cleanCachedNames ?? false,
  });
}

for (const [label, config] of Object.entries(INTERNAL_EVIDENCE)) {
  evidenceByLabel.set(label, {
    sourceWeight: config.sourceWeight,
    canonical: config.canonical ?? false,
    trustedRetailer: config.trustedRetailer ?? false,
    cleanCachedNames: config.cleanCachedNames ?? false,
  });
}

function matchesProviderLabel(
  providerName: string,
  label: string,
  predicate: (config: ProviderEvidenceProfile) => boolean,
): boolean {
  const config = evidenceByLabel.get(label);
  if (!config || !predicate(config)) return false;
  const normalized = providerName.toLowerCase();
  return (
    providerName === label || normalized.includes(label.toLowerCase())
  );
}

export function getCanonicalProviderLabels(): string[] {
  return [...evidenceByLabel.entries()]
    .filter(([, config]) => config.canonical)
    .map(([label]) => label);
}

export function getTrustedRetailerProviderLabels(): string[] {
  return [...evidenceByLabel.entries()]
    .filter(([, config]) => config.trustedRetailer)
    .map(([label]) => label);
}

export function isCanonicalProvider(providerName: string): boolean {
  if (evidenceByLabel.get(providerName)?.canonical) return true;
  return getCanonicalProviderLabels().some((label) =>
    matchesProviderLabel(providerName, label, (config) => config.canonical),
  );
}

export function isTrustedRetailerProvider(providerName: string): boolean {
  if (evidenceByLabel.get(providerName)?.trustedRetailer) return true;
  return getTrustedRetailerProviderLabels().some((label) =>
    matchesProviderLabel(
      providerName,
      label,
      (config) => config.trustedRetailer,
    ),
  );
}

export function isAnchorProvider(providerName: string): boolean {
  return (
    isCanonicalProvider(providerName) || isTrustedRetailerProvider(providerName)
  );
}

export function sourceWeightForProvider(
  providerName: string,
  isAlias = false,
): number {
  const config = evidenceByLabel.get(providerName);
  const weight =
    config?.sourceWeight ??
    (isCanonicalProvider(providerName)
      ? 0.36
      : isTrustedRetailerProvider(providerName)
        ? 0.28
        : 0.08);
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
