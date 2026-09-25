import { repairCatalogColonSubstitute } from "@/core/enrich/titles/normalize";
import { cleanTitleForDisplay } from "@/core/identify/titleUtils";
import { hasUnrequestedSeriesSuffixToken } from "@/core/enrich/titleMatching";

function normalizeTitleKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeAliasValue(value: string): string {
  return repairCatalogColonSubstitute(value.replace(/\s+/g, " ").trim());
}

/** HDJV / listing placeholders and empty stand-ins — never "Aussi connu sous". */
const PLACEHOLDER_ALIAS =
  /^(n\/?c|n\/?a|n\.?\s*c\.?|n\.?\s*a\.?|nc|na|unknown|tbd|tba|null|undefined|-|—|–|\.{1,3}|sans titre|non communiqu[ée]e?)$/i;

function stripAliasDecorations(value: string): string {
  return value
    .replace(/^\[+|\]+$/g, "")
    .replace(/^\(+|\)+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reject noise that providers dump into aliases: `n/c`, platform-prefixed
 * copies of the same title ("Xbox 360 Prototype"), IGDB bracket stubs
 * ("[Grand Prototype]").
 */
export function isNoiseDisplayAlias(
  alias: string,
  displayTitle?: string | null,
): boolean {
  const trimmed = normalizeAliasValue(alias);
  if (!trimmed || trimmed.length < 2) return true;
  if (PLACEHOLDER_ALIAS.test(trimmed)) return true;
  // Entirely bracketed titles are usually wrong-game / unreleased stubs.
  if (/^\[[^\]]+\]$/.test(trimmed)) return true;

  const display = displayTitle?.trim();
  if (!display) return false;

  const aliasCore = normalizeTitleKey(
    cleanTitleForDisplay(stripAliasDecorations(trimmed), {
      preservePlatformSuffix: false,
    }),
  );
  const displayCore = normalizeTitleKey(
    cleanTitleForDisplay(display, { preservePlatformSuffix: false }),
  );
  return Boolean(aliasCore && displayCore && aliasCore === displayCore);
}

/** Normalize metadata.aliases whether stored as JSON string or string[]. */
export function metadataAliases(aliases: unknown): string[] | undefined {
  if (!aliases) return undefined;
  if (Array.isArray(aliases)) {
    return aliases
      .filter((value): value is string => typeof value === "string")
      .map(normalizeAliasValue)
      .filter(Boolean);
  }
  if (typeof aliases === "string") {
    try {
      const parsed = JSON.parse(aliases);
      return Array.isArray(parsed)
        ? parsed
            .filter((value): value is string => typeof value === "string")
            .map(normalizeAliasValue)
            .filter(Boolean)
        : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
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
  const exclude = normalizeTitleKey(repairCatalogColonSubstitute(title));
  const aliases = Array.from(
    new Set(
      sources
        .filter((value): value is string => Boolean(value?.trim()))
        .map(normalizeAliasValue),
    ),
  ).filter(
    (alias) =>
      normalizeTitleKey(alias) !== exclude &&
      !isNoiseDisplayAlias(alias, title),
  );

  return aliases.length > 0 ? aliases : undefined;
}

/**
 * Official catalog alternate names from a provider payload → MetadataResult.aliases.
 * Marketplace listing titles must not go through here.
 */
export function catalogAliasesFromNames(
  title: string | null | undefined,
  names: readonly (string | null | undefined)[],
): string[] | undefined {
  const display = title?.trim() || "";
  if (!display) {
    const cleaned = Array.from(
      new Set(
        names
          .filter((value): value is string => Boolean(value?.trim()))
          .map(normalizeAliasValue)
          .filter((alias) => !isNoiseDisplayAlias(alias)),
      ),
    );
    return cleaned.length > 0 ? cleaned : undefined;
  }
  return aliasesExcludingTitle(display, ...names);
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

/**
 * Names shown under "Aussi connu sous": stored aliases plus the catalog
 * `metadata.title` when it differs from the collector's display name.
 * (Short ScreenScraper noms like "Wrc 4" often land only on metadata.title.)
 *
 * Cover titles tagged with a language role (fr/en/de/…) are also included —
 * TCG prints store one jaquette per language with the regional full name.
 */
export function displayAliasesForItem(input: {
  name?: string | null;
  metadataTitle?: string | null;
  aliases?: unknown;
  attachments?: Array<{
    type?: string | null;
    role?: string | null;
    title?: string | null;
  }> | null;
}): string[] {
  const displayName = input.name?.trim() || "";
  const exclude = new Set(
    displayName ? [normalizeTitleKey(normalizeAliasValue(displayName))] : [],
  );
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const candidate of [
    ...(metadataAliases(input.aliases) ?? []),
    input.metadataTitle,
    ...regionalCoverAliasTitles(input.attachments),
  ]) {
    if (typeof candidate !== "string") continue;
    const trimmed = normalizeAliasValue(candidate);
    if (!trimmed) continue;
    if (isNoiseDisplayAlias(trimmed, displayName || input.metadataTitle)) {
      continue;
    }
    const key = normalizeTitleKey(trimmed);
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    aliases.push(trimmed);
  }

  return aliases;
}

/** Cover titles whose `role` is a language code (Lorcana FR/EN/DE/IT jaquettes). */
export function regionalCoverAliasTitles(
  attachments:
    | Array<{
        type?: string | null;
        role?: string | null;
        title?: string | null;
      }>
    | null
    | undefined,
): string[] {
  if (!attachments?.length) return [];
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (attachment.type !== "cover") continue;
    const role = attachment.role?.trim().toLowerCase();
    if (!role || !/^[a-z]{2}(?:-[a-z]{2})?$/.test(role)) continue;
    const title = attachment.title?.trim();
    if (!title) continue;
    const key = normalizeTitleKey(normalizeAliasValue(title));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    titles.push(normalizeAliasValue(title));
  }
  return titles;
}
