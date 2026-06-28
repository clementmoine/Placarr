export type DetailFact = {
  kind: string;
  label: string;
  value: string;
  url?: string;
  source?: string;
  sourceCount?: number;
  sourceNames?: string[];
  sourceMeta?: string;
  priority?: number;
  isBoardGameRatingSource?: boolean;
  isPcSpecificFact?: boolean;
  isDigitalStorefrontSource?: boolean;
  isHowLongToBeatSource?: boolean;
  providerLabel?: string;
};

const CONSOLIDATABLE_KINDS = new Set([
  "duration",
  "completion-time",
  "playtime",
  "time-to-beat",
  "pages",
  "tracks",
  "complexity",
  "cooperative",
  "modes",
]);

/** Split a fact `source` field into distinct provider/source tokens. */
export function parseFactSourceList(source: string): string[] {
  return Array.from(
    new Set(
      source
        .split(/\s*,\s*|\s*\+\s*/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
}

export function formatDetailFactSourceToken(
  fact: DetailFact,
  sourceToken: string,
): string {
  const trimmed = sourceToken.trim();
  if (!trimmed) return trimmed;

  if (fact.sourceNames?.includes(trimmed)) {
    return trimmed;
  }

  if (fact.isHowLongToBeatSource) {
    const hltbMatch = trimmed.match(/^how long to beat(?:\s*·\s*(.+))?$/i);
    if (hltbMatch) {
      const platform = hltbMatch[1]?.trim();
      return platform ? `How Long to Beat · ${platform}` : "How Long to Beat";
    }
    if (trimmed === fact.source?.trim()) return trimmed;
  }

  const parsedSources = fact.source ? parseFactSourceList(fact.source) : [];
  if (
    fact.providerLabel &&
    parsedSources.length === 1 &&
    parsedSources[0] === trimmed
  ) {
    return fact.providerLabel;
  }

  return trimmed;
}

export function getFactSourceNames(fact: DetailFact): string[] {
  if (fact.sourceNames && fact.sourceNames.length > 0) {
    return fact.sourceNames;
  }
  if (!fact.source) {
    return [];
  }
  return parseFactSourceList(fact.source).map((src) =>
    formatDetailFactSourceToken(fact, src),
  );
}

export function isMaxPlayersFact(fact: DetailFact): boolean {
  return fact.kind === "players" && /max|maximum/i.test(fact.label);
}

export function parsePlayerFactRange(fact: DetailFact) {
  const value = fact.value.trim();
  const range = value.match(/^(\d+)\s*[-–—à]\s*(\d+)$/);
  if (range) {
    return {
      min: Number(range[1]),
      max: Number(range[2]),
      maxOnly: false,
    };
  }

  const single = value.match(/^(\d+)$/);
  if (!single) return null;
  const count = Number(single[1]);
  return {
    min: isMaxPlayersFact(fact) ? null : count,
    max: count,
    maxOnly: isMaxPlayersFact(fact),
  };
}

export function consolidatePlayerFacts(facts: DetailFact[]): DetailFact[] {
  const playerFacts = facts.filter((fact) => fact.kind === "players");
  if (playerFacts.length <= 1) return facts;

  const parsed = playerFacts
    .map((fact) => ({
      fact,
      range: parsePlayerFactRange(fact),
    }))
    .filter(
      (entry): entry is {
        fact: DetailFact;
        range: { min: number | null; max: number; maxOnly: boolean };
      } => entry.range !== null
    );

  if (parsed.length === 0) return facts;

  // Step 1: Filter out maxOnly facts when there is an explicit fact with the same max.
  const explicit = parsed.filter((entry) => entry.range.min !== null);
  
  const filtered = parsed.filter((entry) => {
    if (!entry.range.maxOnly) return true;
    const hasMatchingExplicit = explicit.some(
      (exp) => exp.range.max === entry.range.max
    );
    return !hasMatchingExplicit;
  });

  // Step 2: Group the remaining facts by their range signature
  const groupsMap = new Map<string, {
    min: number | null;
    max: number;
    maxOnly: boolean;
    facts: DetailFact[];
    sources: string[];
  }>();

  for (const entry of filtered) {
    const key = `${entry.range.min}:${entry.range.max}:${entry.range.maxOnly}`;
    const sources = getFactSourceNames(entry.fact);
    
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        min: entry.range.min,
        max: entry.range.max,
        maxOnly: entry.range.maxOnly,
        facts: [entry.fact],
        sources: [...sources],
      });
    } else {
      const grp = groupsMap.get(key)!;
      grp.facts.push(entry.fact);
      grp.sources = Array.from(new Set([...grp.sources, ...sources]));
    }
  }

  const groups = Array.from(groupsMap.values());
  const maxSources = Math.max(...groups.map((g) => g.sources.length));
  const winners = groups.filter((g) => g.sources.length === maxSources);

  let unifiedFact: DetailFact;

  if (winners.length === 1) {
    const win = winners[0];
    const allMergedSources = Array.from(
      new Set(parsed.flatMap((entry) => getFactSourceNames(entry.fact)))
    );

    unifiedFact = {
      kind: "players",
      label: win.maxOnly ? "Max players" : "Players",
      value: win.maxOnly
        ? String(win.max)
        : win.min === win.max
        ? String(win.min)
        : `${win.min}-${win.max}`,
      sourceNames: allMergedSources,
      sourceCount: allMergedSources.length,
      source: undefined,
    };
  } else {
    // Tie between multiple winners!
    const parts = winners.map((win) => {
      if (win.maxOnly) {
        return `${win.max} max`;
      } else {
        return win.min === win.max ? String(win.min) : `${win.min}-${win.max}`;
      }
    });

    parts.sort();

    const allMergedSources = Array.from(
      new Set(parsed.flatMap((entry) => getFactSourceNames(entry.fact)))
    );

    const allMax = winners.every((win) => win.maxOnly);

    unifiedFact = {
      kind: "players",
      label: allMax ? "Max players" : "Players",
      value: parts.join("|"),
      sourceNames: allMergedSources,
      sourceCount: allMergedSources.length,
      source: undefined,
    };
  }

  const nonPlayerFacts = facts.filter((fact) => fact.kind !== "players");
  return [...nonPlayerFacts, unifiedFact];
}

export function consolidateGeneralFacts(facts: DetailFact[]): DetailFact[] {
  const targetFacts = facts.filter((f) => CONSOLIDATABLE_KINDS.has(f.kind));
  if (targetFacts.length === 0) return facts;

  const kinds = Array.from(new Set(targetFacts.map((f) => f.kind)));
  
  let result = facts.filter((f) => !CONSOLIDATABLE_KINDS.has(f.kind));

  for (const kind of kinds) {
    const kindFacts = targetFacts.filter((f) => f.kind === kind);
    if (kindFacts.length <= 1) {
      result.push(...kindFacts);
      continue;
    }

    const groupsMap = new Map<string, {
      value: string;
      facts: DetailFact[];
      sources: string[];
    }>();

    for (const fact of kindFacts) {
      const normalizedValue = fact.value.trim().toLowerCase();
      const sources = getFactSourceNames(fact);
      
      if (!groupsMap.has(normalizedValue)) {
        groupsMap.set(normalizedValue, {
          value: fact.value.trim(),
          facts: [fact],
          sources: [...sources],
        });
      } else {
        const grp = groupsMap.get(normalizedValue)!;
        grp.facts.push(fact);
        grp.sources = Array.from(new Set([...grp.sources, ...sources]));
      }
    }

    const groups = Array.from(groupsMap.values());
    const maxSources = Math.max(...groups.map((g) => g.sources.length));
    const winners = groups.filter((g) => g.sources.length === maxSources);

    winners.sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));

    const allMergedSources = Array.from(
      new Set(kindFacts.flatMap((f) => getFactSourceNames(f)))
    );

    const firstWinnerFact = winners[0].facts[0];

    const unifiedFact: DetailFact = {
      ...firstWinnerFact,
      value: winners.map((w) => w.value).join("|"),
      sourceNames: allMergedSources,
      sourceCount: allMergedSources.length,
      source: undefined,
    };

    result.push(unifiedFact);
  }

  return result;
}
