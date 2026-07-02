import type { Prisma } from "@prisma/client";

import { TITLE_TOKEN_EQUIVALENT_GROUPS } from "@/lib/title/tokenEquivalents";
import { stripVolumeMarkersKeepingNumber } from "@/lib/title/volumeNumber";

const MIN_AND_TOKEN_LENGTH = 2;

/** Zero-padding variants of a numeric token so search ignores padding (1↔01↔001). */
function numericPaddingVariants(token: string): string[] {
  const match = /^0*(\d+)$/.exec(token);
  if (!match) return [];
  const digits = match[1];
  return Array.from(
    new Set([digits, digits.padStart(2, "0"), digits.padStart(3, "0")]),
  );
}

function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function applyTokenCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function buildTokenVariants(token: string): string[] {
  const variants = new Set<string>();
  const cleaned = token.trim();
  if (!cleaned) return [];

  variants.add(cleaned);

  for (const numeric of numericPaddingVariants(cleaned)) {
    variants.add(numeric);
  }

  const lower = cleaned.toLowerCase();
  if (lower.endsWith("ings") && cleaned.length > 5) {
    variants.add(cleaned.slice(0, -1));
  }
  if (lower.endsWith("s") && cleaned.length > 4) {
    variants.add(cleaned.slice(0, -1));
  }
  if (lower.endsWith("ts") && cleaned.length > 4) {
    variants.add(`${cleaned.slice(0, -2)}ds`);
  }
  if (lower.endsWith("ds") && cleaned.length > 4) {
    variants.add(`${cleaned.slice(0, -2)}ts`);
  }

  for (const group of TITLE_TOKEN_EQUIVALENT_GROUPS) {
    if (!group.some((entry) => entry.toLowerCase() === lower)) continue;
    for (const alt of group) {
      if (alt.toLowerCase() === lower) continue;
      variants.add(applyTokenCase(cleaned, alt));
    }
  }

  return Array.from(variants);
}

function buildPhraseVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const normalizedSpacing = trimmed.replace(/\s+/g, " ");
  const tokens = normalizedSpacing.split(" ").filter(Boolean);
  const phrases = new Set<string>([normalizedSpacing]);

  if (tokens.length > 0 && tokens.length <= 4) {
    const tokenVariants = tokens.map(buildTokenVariants);
    let combinations = [""];

    for (const variants of tokenVariants) {
      combinations = combinations
        .flatMap((prefix) =>
          variants.map((variant) =>
            prefix ? `${prefix} ${variant}` : variant,
          ),
        )
        .slice(0, 24);
    }

    combinations.forEach((phrase) => phrases.add(phrase));
  }

  const cleanBarcode = normalizedSpacing.replace(/[^\d]/g, "");
  if (cleanBarcode.length >= 8) {
    phrases.add(cleanBarcode);
  }

  return unique(Array.from(phrases));
}

function searchTokens(searchTerm: string): string[] {
  return unique(
    searchTerm
      .trim()
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= MIN_AND_TOKEN_LENGTH || /^\d+$/.test(token),
      ),
  );
}

function fieldContainsConditions(
  term: string,
  mode: "insensitive",
): Prisma.ItemWhereInput[] {
  return [
    { name: { contains: term, mode } },
    { description: { contains: term, mode } },
    { barcode: { contains: term, mode } },
    { metadata: { is: { title: { contains: term, mode } } } },
    { metadata: { is: { sourceQuery: { contains: term, mode } } } },
    { metadata: { is: { aliases: { contains: term, mode } } } },
    { metadata: { is: { facts: { contains: term, mode } } } },
    {
      metadata: {
        is: {
          authors: { some: { name: { contains: term, mode } } },
        },
      },
    },
  ];
}

function tokenOrConditions(token: string): Prisma.ItemWhereInput {
  const i = "insensitive" as const;
  return {
    OR: buildTokenVariants(token).flatMap((term) =>
      fieldContainsConditions(term, i),
    ),
  };
}

function buildTokenAndSearchCondition(
  searchTerm: string,
): Prisma.ItemWhereInput | null {
  // Tokenize on the volume-normalized term so a different marker/padding never
  // blocks an AND match ("Naruto vol. 1" / "Naruto n°01" → tokens naruto + 1).
  const tokens = searchTokens(stripVolumeMarkersKeepingNumber(searchTerm));
  if (tokens.length <= 1) return null;
  return { AND: tokens.map(tokenOrConditions) };
}

export function buildItemSearchConditions(
  searchTerm: string,
): Prisma.ItemWhereInput[] {
  const i = "insensitive" as const;
  const conditions = buildPhraseVariants(searchTerm).flatMap((term) =>
    fieldContainsConditions(term, i),
  );
  const tokenAnd = buildTokenAndSearchCondition(searchTerm);
  if (tokenAnd) conditions.push(tokenAnd);
  return conditions;
}

/** Client-side mirror of the server search (optimistic cache inserts). */
export function itemMatchesSearchQuery(
  haystacks: string[],
  searchTerm: string,
): boolean {
  const trimmed = searchTerm.trim();
  if (!trimmed) return true;

  const normalizedHaystacks = haystacks
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  const haystackContains = (needle: string) =>
    normalizedHaystacks.some((value) => value.includes(needle.toLowerCase()));

  const phraseVariants = buildPhraseVariants(trimmed);
  if (phraseVariants.some((phrase) => haystackContains(phrase))) {
    return true;
  }

  // Mirror the server: marker/padding-agnostic tokens (Naruto n°01 → naruto + 1).
  const tokens = searchTokens(stripVolumeMarkersKeepingNumber(trimmed));
  if (tokens.length <= 1) {
    if (haystackContains(trimmed)) return true;
    const token = tokens[0];
    return token
      ? buildTokenVariants(token).some((variant) => haystackContains(variant))
      : false;
  }

  return tokens.every((token) =>
    buildTokenVariants(token).some((variant) => haystackContains(variant)),
  );
}

export function itemSearchHaystacks(item: {
  name?: string | null;
  description?: string | null;
  barcode?: string | null;
  metadata?: {
    title?: string | null;
    aliases?: string[] | string | null;
    sourceQuery?: string | null;
    facts?: Array<{ kind?: string; value?: string | null }> | string | null;
    authors?: Array<{ name?: string | null }> | null;
  } | null;
}): string[] {
  const haystacks = [
    item.name,
    item.description,
    item.barcode,
    item.metadata?.title,
    item.metadata?.sourceQuery,
  ];

  const aliases = item.metadata?.aliases;
  if (Array.isArray(aliases)) {
    haystacks.push(...aliases);
  } else if (typeof aliases === "string") {
    haystacks.push(aliases);
  }

  let facts = item.metadata?.facts;
  if (typeof facts === "string") {
    haystacks.push(facts);
  } else {
    haystacks.push(...aliasValuesFromFactsForSearch(facts));
  }

  for (const author of item.metadata?.authors || []) {
    if (author?.name) haystacks.push(author.name);
  }

  return haystacks.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

function aliasValuesFromFactsForSearch(
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
