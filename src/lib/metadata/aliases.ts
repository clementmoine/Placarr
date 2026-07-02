function normalizeTitleKey(value: string): string {
  return value.toLowerCase().trim();
}

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

/** Unique aliases that are not the promoted display title. */
export function aliasesExcludingTitle(
  title: string,
  ...sources: Array<string | null | undefined>
): string[] | undefined {
  const exclude = normalizeTitleKey(title);
  const aliases = Array.from(
    new Set(sources.filter((value): value is string => Boolean(value?.trim()))),
  ).filter((alias) => normalizeTitleKey(alias) !== exclude);

  return aliases.length > 0 ? aliases : undefined;
}

export function promoteTitleKeepingAliases(
  metadata: { title?: string | null; aliases?: string[] | null },
  newTitle: string,
  extraAliases: Array<string | null | undefined> = [],
): string[] | undefined {
  return aliasesExcludingTitle(
    newTitle,
    metadata.title,
    ...(metadata.aliases || []),
    ...extraAliases,
  );
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
): string[] | undefined {
  const collected = sources.flatMap((source) => [
    source.title,
    ...(source.aliases || []),
    ...(source.regionalTitles || []).map((entry) => entry.text),
    ...parentheticalTitleFragments(source.title),
    ...aliasValuesFromFacts(source.facts),
  ]);

  return aliasesExcludingTitle(displayTitle, ...collected);
}
