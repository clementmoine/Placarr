/**
 * Space CamelCase finish / varnish ids for display chips.
 *
 * Publisher ids stay `RainbowPillars` in data; the tile chip uses `uppercase`,
 * which otherwise paints `RAINBOWPILLARS` as one unreadable run.
 *
 * Plain finishes (`None`, `nonfoil`…) keep their provider spelling in storage
 * and get a locale label via {@link localizeFinishLabel}.
 */

/** i18n keys for provider spellings that mean “no foil treatment”. */
const PLAIN_FINISH_LABEL_KEYS: Record<string, string> = {
  none: "items.finishes.none",
  nonfoil: "items.finishes.nonfoil",
  "non-foil": "items.finishes.nonfoil",
  normal: "items.finishes.normal",
};

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

/** Message key for a plain finish, or null when the value is a named effect. */
export function finishLabelMessageKey(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return PLAIN_FINISH_LABEL_KEYS[key] ?? null;
}

/**
 * Locale-aware finish chip. Falls back to {@link formatFinishLabel} for
 * Silver / Lore / RainbowPillars and every other publisher id.
 */
export function localizeFinishLabel(
  value: string,
  t: (key: string) => string,
): string {
  const messageKey = finishLabelMessageKey(value);
  if (messageKey) return t(messageKey);
  return formatFinishLabel(value);
}
