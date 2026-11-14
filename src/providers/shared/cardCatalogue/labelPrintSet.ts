/**
 * Resolve a player-facing set label from a `{ id, label }` list (sync).
 * Used by `ProviderModule.labelPrintSet` — never hardcode a pack in admin/core.
 */
export function labelFromPrintSetOptions(
  sets: readonly { id: string; label: string }[],
  setCode: string,
): string | null {
  const code = setCode.trim();
  if (!code) return null;
  const needle = code.toLowerCase();
  const hit = sets.find((row) => row.id.trim().toLowerCase() === needle);
  return hit?.label?.trim() || code;
}
