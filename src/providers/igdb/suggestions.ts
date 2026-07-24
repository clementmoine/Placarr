import { getIGDBSuggestions } from "./fetch";

function normalizeSuggestionTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export async function getIGDBDatabaseSuggestions(
  name: string,
  cleanedName: string,
  platform?: string | null,
): Promise<string[]> {
  const rawName = name.trim();
  const rawSuggestions = await getIGDBSuggestions(rawName, platform);
  const hasExactSuggestion = rawSuggestions.some(
    (suggestion) =>
      normalizeSuggestionTitle(suggestion) ===
      normalizeSuggestionTitle(rawName),
  );
  if (hasExactSuggestion) {
    return rawSuggestions.filter(
      (suggestion) =>
        normalizeSuggestionTitle(suggestion) ===
        normalizeSuggestionTitle(rawName),
    );
  }
  return Array.from(
    new Set([
      ...rawSuggestions,
      ...(cleanedName.toLowerCase() !== rawName.toLowerCase()
        ? await getIGDBSuggestions(cleanedName, platform)
        : []),
    ]),
  );
}
