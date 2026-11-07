import { hasUnrequestedSeriesSuffixToken } from "@/core/enrich/titleMatching";
import { aliasesExcludingTitle } from "@/core/enrich/aliases";

function parentheticalTitleFragments(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return Array.from(value.matchAll(/\(([^)]+)\)/g))
    .map((match) => match[1]?.trim())
    .filter((fragment): fragment is string => Boolean(fragment));
}

function aliasValuesFromFacts(
  facts: Array<{ kind?: string; value?: string | null }> | null | undefined,
): string[] {
  if (!facts?.length) return [];
  return facts.flatMap((fact) => {
    if (fact.kind !== "aliases" || !fact.value?.trim()) return [];
    return fact.value
      .split(/[·•|/]/)
      .map((part) => part.trim())
      .filter(Boolean);
  });
}

/** Union of every provider title/alias variant worth indexing for search. */
export function collectMergedSearchAliases(
  sources: Array<{
    title?: string | null;
    aliases?: string[] | null;
    regionalTitles?: Array<{ text?: string | null }> | null;
    facts?: Array<{ kind?: string; value?: string | null }> | null;
  }>,
  displayTitle: string,
  requestedTitle?: string | null,
): string[] | undefined {
  const collected = sources.flatMap((source) => [
    source.title,
    ...(source.aliases || []),
    ...(source.regionalTitles || []).map((entry) => entry.text),
    ...parentheticalTitleFragments(source.title),
    ...aliasValuesFromFacts(source.facts),
  ]);

  const aliases = aliasesExcludingTitle(displayTitle, ...collected);
  if (!aliases?.length) return undefined;
  const request = requestedTitle?.trim();
  if (!request) return aliases;
  const filtered = aliases.filter(
    (alias) => !hasUnrequestedSeriesSuffixToken(request, alias),
  );
  return filtered.length > 0 ? filtered : undefined;
}
