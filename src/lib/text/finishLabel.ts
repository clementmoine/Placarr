/**
 * Space CamelCase finish / varnish ids for display chips.
 *
 * Publisher ids stay `RainbowPillars` in data; the tile chip uses `uppercase`,
 * which otherwise paints `RAINBOWPILLARS` as one unreadable run.
 */
export function formatFinishLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
