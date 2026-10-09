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
 * Segments must stay free of both separators (`:` / `-`), otherwise a key
 * could not be parsed back. Collector numbers and set codes are alphanumeric
 * (plus `.` for TCGdex set codes like `sv03.5`, and `!` / `?` for Unown forms).
 */
const SEGMENT_PATTERN = /^[a-z0-9.!?]+$/;

export type PrintIdentity = {
  /** Game slug, e.g. the Lorcana slug. Not a provider id. */
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

/**
 * Collector numbers that carry a family prefix (`d0123`, `ni0046`, `sp0025`)
 * are unique in the game — the same card may be listed under several sets.
 *
 * Bare digits (`1`, `207`, `001`) stay set-scoped (Lorcana, One Piece…).
 */
export function isGameUniqueCollectorNumber(
  number: string | null | undefined,
): boolean {
  return /^[a-z]{1,6}\d+[a-z]*$/i.test((number ?? "").trim());
}

/**
 * Possession / identité hors set : `game|number|grouping`.
 *
 * `null` quand le numéro n'est pas game-unique — on ne doit alors **pas**
 * coller Lorcana `1-1` et `2-1`.
 */
export function printCollectableKey(
  printKey: string | null | undefined,
): string | null {
  const id = parsePrintKey(printKey);
  if (!id || !isGameUniqueCollectorNumber(id.number)) return null;
  return [id.game, id.number, id.grouping ?? ""].join("|");
}

/**
 * Set order as collectors browse binders: numeric release codes ascending
 * (`1` Premier Chapitre before `11`), then lettered codes (`q1`).
 */
export function comparePrintSetCodes(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null) {
    return leftNumber - rightNumber;
  }
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

/** Collector number with optional variant letter (`4`, `4a`, `20`). */
function compareCollectorNumbers(left: string, right: string): number {
  const parse = (value: string) => {
    const match = value.match(/^(\d+)([a-z]*)$/i);
    if (!match) return { num: null as number | null, suffix: value };
    return { num: Number(match[1]), suffix: (match[2] ?? "").toLowerCase() };
  };
  const a = parse(left);
  const b = parse(right);
  if (a.num != null && b.num != null) {
    if (a.num !== b.num) return a.num - b.num;
    return a.suffix.localeCompare(b.suffix);
  }
  if (a.num != null) return -1;
  if (b.num != null) return 1;
  return left.localeCompare(right);
}

/**
 * Optional per-game binder order (family prefixes, etc.). Return `null` to
 * fall through to the default set → number → grouping order.
 * Registered by catalogue modules — never game literals in this file.
 */
export type PrintKeyCompareHook = (
  left: PrintIdentity,
  right: PrintIdentity,
  leftKey: string,
  rightKey: string,
) => number | null;

const printKeyCompareByGame = new Map<string, PrintKeyCompareHook>();

export function registerPrintKeyCompare(
  game: string,
  compare: PrintKeyCompareHook,
): void {
  const slug = game.trim().toLowerCase();
  if (!slug) return;
  printKeyCompareByGame.set(slug, compare);
}

/** Test helper — drop one game hook without wiping others. */
export function unregisterPrintKeyCompare(game: string): void {
  printKeyCompareByGame.delete(game.trim().toLowerCase());
}

/**
 * Binder order: game → (optional game hook) → set → number → base before
 * promo grouping → full key. Missing / malformed keys sort after real prints.
 */
export function comparePrintKeys(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const a = parsePrintKey(left);
  const b = parsePrintKey(right);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const game = a.game.localeCompare(b.game);
  if (game !== 0) return game;

  const hooked = printKeyCompareByGame.get(a.game);
  if (hooked) {
    const custom = hooked(a, b, left ?? "", right ?? "");
    if (custom != null) return custom;
  }

  const set = comparePrintSetCodes(a.set, b.set);
  if (set !== 0) return set;

  const number = compareCollectorNumbers(a.number, b.number);
  if (number !== 0) return number;

  const groupA = a.grouping ?? "";
  const groupB = b.grouping ?? "";
  if (!groupA && groupB) return -1;
  if (groupA && !groupB) return 1;
  const group = groupA.localeCompare(groupB);
  if (group !== 0) return group;

  return (left ?? "").localeCompare(right ?? "");
}
