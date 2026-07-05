/** Split a pasted list into unique, trimmed item names (one per line). */
export function parseNameList(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }

  return names;
}
