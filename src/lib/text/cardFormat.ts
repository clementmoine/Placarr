import { Type } from "@/generated/prisma/browser";

/** Quarters of a turn for a face that shares the shelf format but is rotated. */
export type FaceQuarterTurns = 0 | 1 | 2 | 3;

export function normalizeFaceQuarterTurns(
  value: number | null | undefined,
): FaceQuarterTurns {
  if (value == null || !Number.isFinite(value)) return 0;
  return ((((Math.round(value) % 4) + 4) % 4) as FaceQuarterTurns);
}

/**
 * Swap width/height when the face is on its side (odd quarter turns).
 * Same physical rectangle as the shelf format — just reoriented.
 */
export function orientAspectRatio(
  aspect: string,
  quarterTurns: number | null | undefined,
): string {
  if (normalizeFaceQuarterTurns(quarterTurns) % 2 === 0) return aspect;
  const match = aspect.trim().match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if (!match) return aspect;
  return `${match[2]} / ${match[1]}`;
}

export function faceRotateDeg(
  quarterTurns: number | null | undefined,
): number {
  return normalizeFaceQuarterTurns(quarterTurns) * 90;
}

export type CardFormat =
  | "default"
  | "square"
  | "tcg"
  | "bluray"
  | "ds"
  | "book"
  | "dvd"
  | "switch"
  | "psp"
  | "vhs"
  | "landscape_retro"
  | "landscape";

/** Ordered list for format pickers (UI). */
export const CARD_FORMATS: readonly CardFormat[] = [
  "default",
  "square",
  "tcg",
  "ds",
  "bluray",
  "dvd",
  "book",
  "switch",
  "psp",
  "vhs",
  "landscape_retro",
  "landscape",
] as const;

/** Named shape that `default` resolves to for a shelf type. */
export function getDefaultCardFormatAlias(
  type: Type | string | null | undefined,
): Exclude<CardFormat, "default"> {
  switch (type) {
    case "musics":
    case "boardgames":
    case "toys":
    case "hardware":
      return "square";
    case "books":
      return "book";
    case "tcg":
      return "tcg";
    case "movies":
    case "games":
    default:
      return "dvd";
  }
}

/** Picker list: hide the named shape that Default already covers. */
export function getCardFormatsForPicker(
  type: Type | string | null | undefined,
): CardFormat[] {
  const alias = getDefaultCardFormatAlias(type);
  return CARD_FORMATS.filter((format) => format !== alias);
}

/** Collapse an explicit alias selection into Default (same ratio). */
export function coerceCardFormatForType(
  cardFormat: string | null | undefined,
  type: Type | string | null | undefined,
): CardFormat {
  if (!cardFormat || cardFormat === "default") return "default";
  if (cardFormat === getDefaultCardFormatAlias(type)) return "default";
  if ((CARD_FORMATS as readonly string[]).includes(cardFormat)) {
    return cardFormat as CardFormat;
  }
  return "default";
}

export function getAspectRatio(
  cardFormat: string | null | undefined,
  type: Type | string | null | undefined,
): string {
  if (cardFormat && cardFormat !== "default") {
    switch (cardFormat) {
      case "square":
        return "1 / 1";
      case "tcg":
        // Standard poker / TCG (MTG, Pokémon…): 2.5″ × 3.5″ → 5:7
        return "5 / 7";
      case "bluray":
        return "1 / 1.18";
      case "ds":
        return "1.12 / 1";
      case "book":
        return "1 / 1.5";
      case "dvd":
      case "game": // legacy fallback
      case "poster": // legacy fallback
        return "1 / 1.414";
      case "switch":
        return "1 / 1.618";
      case "psp":
        return "1 / 1.73";
      case "vhs":
        return "1 / 1.8";
      case "landscape_retro":
        return "1.4 / 1";
      case "landscape":
        return "16 / 9";
      default:
        break;
    }
  }

  // Fallback to type (keep in sync with getDefaultCardFormatAlias)
  switch (type) {
    case "musics":
    case "boardgames":
    case "toys":
    case "hardware":
      return "1 / 1";
    case "books":
      return "1 / 1.5";
    case "tcg":
      return "5 / 7";
    case "movies":
    case "games":
    default:
      return "1 / 1.414";
  }
}

export function getTailwindAspectRatioClass(
  cardFormat: string | null | undefined,
  type: Type | string | null | undefined,
): string {
  if (cardFormat && cardFormat !== "default") {
    switch (cardFormat) {
      case "square":
        return "aspect-square";
      case "tcg":
        return "aspect-[5/7]";
      case "bluray":
        return "aspect-[1/1.18]";
      case "ds":
        return "aspect-[1.12/1]";
      case "book":
        return "aspect-[1/1.5]";
      case "dvd":
      case "game":
      case "poster":
        return "aspect-[1/1.414]";
      case "switch":
        return "aspect-[1/1.618]";
      case "psp":
        return "aspect-[1/1.73]";
      case "vhs":
        return "aspect-[1/1.8]";
      case "landscape_retro":
        return "aspect-[1.4/1]";
      case "landscape":
        return "aspect-video";
      default:
        break;
    }
  }

  // Fallback to type (keep in sync with getDefaultCardFormatAlias)
  switch (type) {
    case "musics":
    case "boardgames":
    case "toys":
    case "hardware":
      return "aspect-square";
    case "books":
      return "aspect-[1/1.5]";
    case "tcg":
      return "aspect-[5/7]";
    case "movies":
    case "games":
    default:
      return "aspect-[1/1.414]";
  }
}

export function getDetailCoverClass(
  cardFormat: string | null | undefined,
  type: string | null | undefined,
): string {
  const format = cardFormat && cardFormat !== "default" ? cardFormat : type;
  switch (format) {
    case "musics":
    case "boardgames":
    case "toys":
    case "hardware":
    case "square":
      return "aspect-square w-full max-w-[260px]";
    case "tcg":
      return "aspect-[5/7] w-full max-w-[220px]";
    case "bluray":
      return "aspect-[1/1.18] w-full max-w-[250px]";
    case "ds":
      return "aspect-[1.12/1] w-full max-w-[280px]";
    case "book":
    case "books":
      return "aspect-[1/1.5] w-full max-w-[240px]";
    case "dvd":
    case "movies":
    case "games":
    case "game":
    case "poster":
      return "aspect-[1/1.414] w-full max-w-[240px]";
    case "switch":
      return "aspect-[1/1.618] w-full max-w-[220px]";
    case "psp":
      return "aspect-[1/1.73] w-full max-w-[210px]";
    case "vhs":
      return "aspect-[1/1.8] w-full max-w-[200px]";
    case "landscape_retro":
      return "aspect-[1.4/1] w-full max-w-[300px]";
    case "landscape":
      return "aspect-video w-full max-w-[320px]";
    default:
      return "aspect-[1/1.414] w-full max-w-[240px]";
  }
}

export function getExploreDetailCoverClass(
  cardFormat: string | null | undefined,
  type: string | null | undefined,
): string {
  const format = cardFormat && cardFormat !== "default" ? cardFormat : type;
  switch (format) {
    case "musics":
    case "boardgames":
    case "toys":
    case "hardware":
    case "square":
      return "aspect-square w-full max-w-[200px]";
    case "tcg":
      return "aspect-[5/7] w-full max-w-[170px]";
    case "bluray":
      return "aspect-[1/1.18] w-full max-w-[190px]";
    case "ds":
      return "aspect-[1.12/1] w-full max-w-[210px]";
    case "book":
    case "books":
      return "aspect-[1/1.5] w-full max-w-[180px]";
    case "dvd":
    case "movies":
    case "games":
    case "game":
    case "poster":
      return "aspect-[1/1.414] w-full max-w-[180px]";
    case "switch":
      return "aspect-[1/1.618] w-full max-w-[160px]";
    case "psp":
      return "aspect-[1/1.73] w-full max-w-[150px]";
    case "vhs":
      return "aspect-[1/1.8] w-full max-w-[145px]";
    case "landscape_retro":
      return "aspect-[1.4/1] w-full max-w-[220px]";
    case "landscape":
      return "aspect-video w-full max-w-[240px]";
    default:
      return "aspect-[1/1.414] w-full max-w-[180px]";
  }
}
