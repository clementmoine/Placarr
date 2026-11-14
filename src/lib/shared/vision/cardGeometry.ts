/**
 * Printed TCG face geometry — single source for classical detect + usable gate.
 */

export const CARD_PRINT_SIDES = { short: 63, long: 88 } as const;

/** Nominal long/short of a TCG face (~1.40). */
export const CARD_PRINT_ASPECT =
  CARD_PRINT_SIDES.long / CARD_PRINT_SIDES.short;

/**
 * How far perspective / crop may stretch past the print aspect before a
 * blob is a strip (welded neighbours), not a card.
 */
export const CARD_ASPECT_PERSPECTIVE_SLACK = 0.45;

/** Never-square floor derived from print aspect. */
export const CARD_ASPECT_MIN =
  1 + (CARD_PRINT_ASPECT - 1) * 0.05;

/** Upper long/short after perspective slack. */
export const CARD_ASPECT_MAX =
  CARD_PRINT_ASPECT * (1 + CARD_ASPECT_PERSPECTIVE_SLACK);
