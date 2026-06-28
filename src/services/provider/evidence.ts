import { PROVIDER_MODULES } from "@/services/provider/registry";

// Fallback source weights, by evidence role, for a provider that does not
// declare its own `sourceWeight`. A provider normally sets this in its module
// (plug-and-play); these defaults only apply to one that opted into a role
// without a weight. An alias title (a localized/secondary name) is trusted less
// than the provider's primary title, by `ALIAS_WEIGHT_FACTOR`.
const DEFAULT_SOURCE_WEIGHT = {
  canonical: 0.36,
  trustedRetailer: 0.28,
  marketplace: 0.08,
} as const;
const ALIAS_WEIGHT_FACTOR = 0.72;

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
const evidenceLabelToProviderId = new Map<string, string>();
const evidenceLabelToDisplayLabel = new Map<string, string>();

for (const module of PROVIDER_MODULES) {
  if (!module.evidence) continue;
  evidenceByLabel.set(module.evidence.label, {
    sourceWeight: module.evidence.sourceWeight,
    canonical: module.evidence.canonical ?? module.info.canonical,
    trustedRetailer: module.evidence.trustedRetailer ?? false,
    cleanCachedNames: module.evidence.cleanCachedNames ?? false,
  });
  evidenceLabelToProviderId.set(module.evidence.label, module.info.id);
  evidenceLabelToDisplayLabel.set(module.evidence.label, module.info.label);
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
  return providerName === label || normalized.includes(label.toLowerCase());
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
      ? DEFAULT_SOURCE_WEIGHT.canonical
      : isTrustedRetailerProvider(providerName)
        ? DEFAULT_SOURCE_WEIGHT.trustedRetailer
        : DEFAULT_SOURCE_WEIGHT.marketplace);
  return isAlias ? weight * ALIAS_WEIGHT_FACTOR : weight;
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

/** Canonical provider id for a barcode evidence label (falls back to the label). */
export function providerIdForEvidenceLabel(label: string): string {
  return evidenceLabelToProviderId.get(label) ?? label;
}

/** Registry display label for a barcode evidence label. */
export function providerDisplayLabelForEvidenceLabel(label: string): string {
  return evidenceLabelToDisplayLabel.get(label) ?? label;
}
