/**
 * Space CamelCase finish / varnish ids for display chips.
 *
 * Publisher ids stay `RainbowPillars` in data; the tile chip uses `uppercase`,
 * which otherwise paints `RAINBOWPILLARS` as one unreadable run.
 *
 * Catalogue / plain finishes keep provider spelling in storage and get a
 * locale label via {@link localizeFinishLabel} (Pokémon: Regular / Holofoil /
 * Reverse Holofoil — never Live’s internal `std` / `ph`).
 */

/** i18n keys for provider spellings that mean “no foil treatment”. */
const PLAIN_FINISH_LABEL_KEYS: Record<string, string> = {
  none: "items.finishes.none",
  nonfoil: "items.finishes.nonfoil",
  "non-foil": "items.finishes.nonfoil",
  normal: "items.finishes.normal",
};

/**
 * Pokémon catalogue + synthetic Live finishes → collector lexicon.
 * Storage ids stay `holo` / `live-ph` / …; chips never show those raw strings.
 */
const CATALOGUE_FINISH_LABEL_KEYS: Record<string, string> = {
  holo: "items.finishes.holo",
  reverse: "items.finishes.reverse",
  firstedition: "items.finishes.firstEdition",
  wpromo: "items.finishes.wPromo",
  // Live rows TCGdex could not name — same paper treatments as holo / reverse.
  "live-std": "items.finishes.holo",
  "live-ph": "items.finishes.reverse",
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

/** Message key for a catalogue / plain finish, or null for named effects. */
export function finishLabelMessageKey(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return (
    PLAIN_FINISH_LABEL_KEYS[key] ?? CATALOGUE_FINISH_LABEL_KEYS[key] ?? null
  );
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
