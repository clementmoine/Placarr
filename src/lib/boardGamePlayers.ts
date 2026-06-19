export function formatBoardGamePlayerCount(
  min?: string | number | null,
  max?: string | number | null,
): string | undefined {
  const minValue =
    min != null && String(min).trim() !== "" ? String(min).trim() : undefined;
  const maxValue =
    max != null && String(max).trim() !== "" ? String(max).trim() : undefined;

  if (!minValue && !maxValue) return undefined;
  if (minValue && maxValue && minValue !== maxValue) {
    return `${minValue} à ${maxValue}`;
  }
  return minValue || maxValue;
}

export function normalizeBoardGamePlayerCount(value: string): string {
  const trimmed = value.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*(?:[-–—]|à|a)\s*(\d+)$/i);
  if (rangeMatch) {
    return `${rangeMatch[1]} à ${rangeMatch[2]}`;
  }
  return trimmed;
}
