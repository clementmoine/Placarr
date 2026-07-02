import { Type } from "@prisma/client";

export type CardFormat =
  | "default"
  | "square"
  | "bluray"
  | "ds"
  | "book"
  | "dvd"
  | "switch"
  | "psp"
  | "vhs"
  | "landscape_retro"
  | "landscape";

export function getAspectRatio(
  cardFormat: string | null | undefined,
  type: Type | string | null | undefined,
): string {
  if (cardFormat && cardFormat !== "default") {
    switch (cardFormat) {
      case "square":
        return "1 / 1";
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

  // Fallback to type
  switch (type) {
    case "musics":
    case "boardgames":
      return "1 / 1";
    case "movies":
      return "1 / 1.5";
    case "books":
      return "1 / 1.5";
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

  // Fallback to type
  switch (type) {
    case "musics":
    case "boardgames":
      return "aspect-square";
    case "movies":
      return "aspect-[1/1.5]";
    case "books":
      return "aspect-[1/1.5]";
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
    case "square":
      return "aspect-square w-full max-w-[260px]";
    case "bluray":
      return "aspect-[1/1.18] w-full max-w-[250px]";
    case "ds":
      return "aspect-[1.12/1] w-full max-w-[280px]";
    case "book":
    case "movies":
    case "books":
      return "aspect-[1/1.5] w-full max-w-[240px]";
    case "dvd":
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
    case "square":
      return "aspect-square w-full max-w-[200px]";
    case "bluray":
      return "aspect-[1/1.18] w-full max-w-[190px]";
    case "ds":
      return "aspect-[1.12/1] w-full max-w-[210px]";
    case "book":
    case "movies":
    case "books":
      return "aspect-[1/1.5] w-full max-w-[180px]";
    case "dvd":
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
