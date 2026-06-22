import { pickPlatformKeyFromSignals } from "@/lib/barcode/gameLookup";

export interface SourceProduct {
  name: string;
  coverUrl?: string | null;
  isAlias?: boolean;
  region?: string | null;
  platformKey?: string | null;
}

export interface ParsedProductName {
  rawName: string;
  cleanName: string;
  title: string;
  normalizedTitle: string;
  platformKey?: string;
  region?: string;
  edition?: string;
  year?: string;
  tokens: Set<string>;
  indicators: Set<string>;
}

export interface ProductEvidence {
  providerName: string;
  rawName: string;
  cleanName: string;
  title: string;
  coverUrl: string | null;
  isCanonical: boolean;
  isTrustedRetailer: boolean;
  isAlias: boolean;
  region: string | null;
  priority: number;
  sourceWeight: number;
  parsed: ParsedProductName;
  // Set when a strong independent marketplace consensus contradicts this
  // canonical barcode match: it stays an anchor (so it survives as a clean
  // alternate) but its cluster confidence is capped so the consensus leads.
  contradictedByConsensus?: boolean;
}

export interface MatchEvidenceSummary {
  providers: string[];
  canonicalProviders: string[];
  trustedRetailerProviders: string[];
  rawCount: number;
  canonicalCount: number;
  trustedRetailerCount: number;
  marketplaceCount: number;
  hasCover: boolean;
  confidence: number;
  reasons: string[];
}

export interface ResolvedMatch {
  name: string;
  suggestions: string[];
  coverUrl: string | null;
  confidence: number;
  evidence: MatchEvidenceSummary;
}

export interface CompiledResult {
  provider: string;
  rawNames: string[];
  cleanName: string;
  displayName: string;
  edition: string | null;
  suggestions: string[];
  matches: ResolvedMatch[];
  platformKey?: string | null;
}

export function pickPlatformKeyFromEvidence(
  evidence: ProductEvidence[],
): string | null {
  const signals = evidence
    .filter((item) => item.parsed.platformKey)
    .map((item) => ({
      value: item.parsed.platformKey,
      weight: item.sourceWeight + (item.isCanonical ? 0.22 : 0),
    }));

  return pickPlatformKeyFromSignals(signals);
}
