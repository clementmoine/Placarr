import type { MetadataObservation } from "@/types/metadataObservation";

export interface BarcodeSourceFact {
  kind: string;
  label: string;
  value: string;
  unit?: string | null;
}

export interface SourceProduct {
  name: string;
  coverUrl?: string | null;
  isAlias?: boolean;
  region?: string | null;
  platformKey?: string | null;
  facts?: BarcodeSourceFact[];
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
  facts?: BarcodeSourceFact[];
  // Set when a strong independent marketplace consensus contradicts this
  // canonical barcode match: it stays an anchor (so it survives as a clean
  // alternate) but its cluster confidence is capped so the consensus leads.
  contradictedByConsensus?: boolean;
  // Subset of the above: the consensus specifically disputed this canonical's
  // EDITION — a sequel number or an edition subtitle (same franchise as the
  // leader, wrong edition — e.g. a bad "Ghost Recon 2" or "Ghost Recon : Island
  // Thunder" mapping of "Ghost Recon"). Such a wrong edition is a known-bad
  // alternate, not a genuinely different product, so it must NOT be surfaced as
  // a pickable alternate (it would shelve the wrong game).
  contradictedEdition?: boolean;
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
  platformKey?: string | null;
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
  observations?: MetadataObservation[];
  observationSchemaVersion?: string;
}
