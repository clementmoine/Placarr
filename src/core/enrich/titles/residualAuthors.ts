import { titleTokenPresentInSet } from "@/core/enrich/titles/tokenEquivalents";
import { identityTokens } from "@/core/enrich/titles/identityTokens";

export function authorTokens(
  authors: string[] | undefined,
  shelfType?: string | null,
): Set<string> {
  const out = new Set<string>();
  for (const author of authors ?? []) {
    for (const token of identityTokens(author, shelfType)) {
      out.add(token);
    }
    for (const piece of author.split(/[,/&]+/)) {
      for (const token of identityTokens(piece, shelfType)) {
        out.add(token);
      }
    }
  }
  return out;
}

export function residualCoveredByAuthors(
  residual: string[],
  requestAuthors: string[] | undefined,
  candidateAuthors: string[] | undefined,
  shelfType?: string | null,
): boolean {
  if (residual.length === 0) return true;
  const known = new Set([
    ...authorTokens(requestAuthors, shelfType),
    ...authorTokens(candidateAuthors, shelfType),
  ]);
  if (known.size === 0) return false;
  return residual.every((token) => titleTokenPresentInSet(token, known));
}

export function authorNamesFromMetadata(
  authors: Array<{ name: string }> | undefined,
): string[] {
  return (authors ?? []).map((a) => a.name).filter(Boolean);
}
