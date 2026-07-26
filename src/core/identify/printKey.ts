/**
 * Print identity — the barcode-equivalent anchor for objects that never carry
 * an EAN/UPC.
 *
 * A trading card has no barcode (only sealed products do), but what is printed
 * on it identifies the print just as stably: the game, the set, the collector
 * number, and — when a set reuses numbers for its promos — the promo grouping.
 *
 * Deliberately **provider-neutral**: the key is built from what a collector can
 * read off the card, never from a provider's internal id, so a second provider
 * for the same game resolves the same key. Provider ids belong in `externalIds`.
 *
 * The key is lowercased so that lookups survive user input; this was checked
 * against the 6386 French and English Lorcana prints and collapses nothing
 * (`4a`/`4A` variants never share a set).
 */

/** Separates the game from the print, and the print's own segments. */
const GAME_SEPARATOR = ":";
const SEGMENT_SEPARATOR = "-";

/**
 * Segments must stay free of both separators, otherwise a key could not be
 * parsed back. Collector numbers and promo groupings are alphanumeric in every
 * dataset seen so far (`4a`, `223`, `P1`, `PD1`).
 */
const SEGMENT_PATTERN = /^[a-z0-9]+$/;

export type PrintIdentity = {
  /** Game slug, e.g. `lorcana`. Not a provider id. */
  game: string;
  /** Set code as printed, e.g. `9`, `Q1`. */
  set: string;
  /** Collector number, variant letter included when there is one: `4a`. */
  number: string;
  /**
   * Promo grouping, when a set prints a promo reusing a base number. Lorcana's
   * `20/204` and `20/P1` are different cards in the same set.
   */
  grouping?: string | null;
};

function normalizeSegment(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/**
 * Build the anchor, or `null` when any segment is missing or carries a
 * separator — a malformed key is worse than none, since it would not round-trip.
 */
export function buildPrintKey(identity: PrintIdentity): string | null {
  const game = normalizeSegment(identity.game);
  const set = normalizeSegment(identity.set);
  const number = normalizeSegment(identity.number);
  const grouping = normalizeSegment(identity.grouping);

  if (!SEGMENT_PATTERN.test(game)) return null;
  if (!SEGMENT_PATTERN.test(set)) return null;
  if (!SEGMENT_PATTERN.test(number)) return null;
  if (grouping && !SEGMENT_PATTERN.test(grouping)) return null;

  const print = grouping
    ? [set, number, grouping].join(SEGMENT_SEPARATOR)
    : [set, number].join(SEGMENT_SEPARATOR);
  return `${game}${GAME_SEPARATOR}${print}`;
}

/** Inverse of {@link buildPrintKey}. `null` when the key is not one of ours. */
export function parsePrintKey(
  key: string | null | undefined,
): PrintIdentity | null {
  const trimmed = key?.trim().toLowerCase();
  if (!trimmed) return null;

  const separator = trimmed.indexOf(GAME_SEPARATOR);
  if (separator <= 0) return null;

  const game = trimmed.slice(0, separator);
  const segments = trimmed.slice(separator + 1).split(SEGMENT_SEPARATOR);
  if (segments.length < 2 || segments.length > 3) return null;

  const [set, number, grouping] = segments;
  const identity: PrintIdentity = {
    game,
    set,
    number,
    grouping: grouping ?? null,
  };

  // Round-trip rather than re-validating: one source of truth for what is legal.
  return buildPrintKey(identity) === trimmed ? identity : null;
}

/** Whether a string looks like a print key rather than a barcode or a title. */
export function isPrintKey(value: string | null | undefined): boolean {
  return parsePrintKey(value) !== null;
}
