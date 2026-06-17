import { Type } from "@prisma/client";

export type CardFormat =
  | "default"
  | "square"
  | "bluray"
  | "dvd"
  | "switch"
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
        return "1 / 1.2";
      case "dvd":
      case "game": // legacy fallback
      case "poster": // legacy fallback
        return "1 / 1.4";
      case "switch":
        return "1 / 1.6";
      case "landscape_retro":
        return "1.4 / 1";
      case "landscape":
        return "1.78 / 1";
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
    case "books":
      return "1 / 1.5"; // standard default type aspect
    case "games":
    default:
      return "1 / 1.4";
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
        return "aspect-[1/1.2]";
      case "dvd":
      case "game":
      case "poster":
        return "aspect-[1/1.4]";
      case "switch":
        return "aspect-[1/1.6]";
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
    case "books":
      return "aspect-[1/1.5]";
    case "games":
    default:
      return "aspect-[1/1.4]";
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
      return "aspect-[1/1.2] w-full max-w-[250px]";
    case "dvd":
    case "games":
    case "game":
    case "poster":
      return "aspect-[1/1.4] w-full max-w-[240px]";
    case "switch":
      return "aspect-[1/1.6] w-full max-w-[220px]";
    case "landscape_retro":
      return "aspect-[1.4/1] w-full max-w-[300px]";
    case "landscape":
      return "aspect-video w-full max-w-[320px]";
    default:
      return "aspect-[1/1.4] w-full max-w-[240px]";
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
      return "aspect-[1/1.2] w-full max-w-[190px]";
    case "dvd":
    case "games":
    case "game":
    case "poster":
      return "aspect-[1/1.4] w-full max-w-[180px]";
    case "switch":
      return "aspect-[1/1.6] w-full max-w-[160px]";
    case "landscape_retro":
      return "aspect-[1.4/1] w-full max-w-[220px]";
    case "landscape":
      return "aspect-video w-full max-w-[240px]";
    default:
      return "aspect-[1/1.4] w-full max-w-[180px]";
  }
}
