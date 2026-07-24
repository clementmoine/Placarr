export type {
  CompiledResult,
  MatchEvidenceSummary,
  ParsedProductName,
  ProductEvidence,
  ResolvedMatch,
  SourceProduct,
} from "./types";
export { buildProductEvidence, uniqueClean } from "./parse";
export { compileResultForType, scoreTypeCandidate } from "./compile";
export { clusterSuggestions } from "./cluster";
export { mergeDuplicateMatches } from "./matchUtils";
