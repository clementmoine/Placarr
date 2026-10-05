/**
 * Optical disc underside kinds for the loose Disc3D hero.
 *
 * Distinctive colours (PS1 black, PS2 blue) require evidence — unknown stays
 * `generic` (honest silver polycarbonate + rainbow), never a confident wrong hue.
 */

export type OpticalDiscKind =
  | "ps1-cd"
  | "ps2-cd"
  | "dvd"
  | "bluray"
  | "audio-cd"
  | "generic";

/** CD capacity ceiling; PS2 DVD dumps sit well above this. */
export const OPTICAL_CD_MAX_BYTES = 800_000_000;
/** Below BD-25 nominal size → treat as DVD-family when size is the only signal. */
export const OPTICAL_DVD_MAX_BYTES = 25_000_000_000;

export type OpticalDiscBackRecipe = {
  kind: OpticalDiscKind;
  /** CSS color for the polycarbonate base. */
  base: string;
  /** 0..1 strength of the iridescent conic overlay. */
  rainbow: number;
  /** Optional warm dual-layer tint (DVD-9 vibe). */
  dualLayer?: boolean;
};

const BACK_RECIPES: Record<OpticalDiscKind, OpticalDiscBackRecipe> = {
  "ps1-cd": {
    kind: "ps1-cd",
    base: "oklch(0.18 0.025 270)",
    rainbow: 0.42,
  },
  "ps2-cd": {
    kind: "ps2-cd",
    base: "oklch(0.38 0.16 268)",
    rainbow: 0.52,
  },
  dvd: {
    kind: "dvd",
    base: "oklch(0.74 0.025 95)",
    rainbow: 0.68,
  },
  bluray: {
    kind: "bluray",
    base: "oklch(0.24 0.05 265)",
    rainbow: 0.82,
  },
  "audio-cd": {
    kind: "audio-cd",
    base: "oklch(0.78 0.02 100)",
    rainbow: 0.72,
  },
  generic: {
    kind: "generic",
    base: "oklch(0.76 0.02 100)",
    rainbow: 0.62,
  },
};

export function opticalDiscBackRecipe(
  kind: OpticalDiscKind,
): OpticalDiscBackRecipe {
  return BACK_RECIPES[kind];
}

function normalizeFormat(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isBluRayFormatLabel(value?: string | null): boolean {
  const n = normalizeFormat(value);
  return (
    n.includes("blu-ray") ||
    n.includes("bluray") ||
    n.includes("blu ray") ||
    n === "bd" ||
    n.startsWith("bd-")
  );
}

export function isDvdFormatLabel(value?: string | null): boolean {
  const n = normalizeFormat(value);
  if (isBluRayFormatLabel(n)) return false;
  return n.includes("dvd");
}

export function isCdRomFormatLabel(value?: string | null): boolean {
  const n = normalizeFormat(value);
  if (isDvdFormatLabel(n) || isBluRayFormatLabel(n)) return false;
  return (
    n.includes("cd-rom") ||
    n === "cdrom" ||
    n === "cd" ||
    n.startsWith("cd ")
  );
}

/**
 * Coarse optical family from a dump size (ScreenScraper `romsize`, Redump…).
 * Returns null when size is missing or non-positive.
 */
export function opticalMediaFormatFromRomBytes(
  bytes: number | null | undefined,
): "CD-ROM" | "DVD-ROM" | "Blu-ray" | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < OPTICAL_CD_MAX_BYTES) return "CD-ROM";
  if (bytes < OPTICAL_DVD_MAX_BYTES) return "DVD-ROM";
  return "Blu-ray";
}

export type ResolveOpticalDiscKindInput = {
  platformKey?: string | null;
  /** Listing / provider media-format fact (DVD, Blu-ray, CD-ROM…). */
  mediaFormatFact?: string | null;
  /** Largest clean dump size in bytes, when known. */
  romBytes?: number | null;
  shelfType?: string | null;
};

/**
 * Resolve the underside recipe for a loose disc. Prefer explicit format facts,
 * then platform + size evidence; never invent PS2 blue without a CD-sized dump
 * or a CD-ROM format label.
 */
/**
 * Shelf / hero presentation: loose copies on disc-native shelves show circular
 * support art in a square tile (games, movies, music). Hardware loose is often
 * a console without media — keep the shelf format.
 */
export function isLooseDiscShelfPresentation(
  condition?: string | null,
  shelfType?: string | null,
): boolean {
  if (condition !== "loose") return false;
  return (
    shelfType === "games" ||
    shelfType === "movies" ||
    shelfType === "musics"
  );
}

export function resolveOpticalDiscKind(
  input: ResolveOpticalDiscKindInput,
): OpticalDiscKind {
  const format = input.mediaFormatFact?.trim() || null;
  const platform = (input.platformKey || "").toLowerCase();
  const bytes =
    input.romBytes != null && Number.isFinite(input.romBytes)
      ? input.romBytes
      : null;
  const fromSize = opticalMediaFormatFromRomBytes(bytes);

  if (isBluRayFormatLabel(format) || fromSize === "Blu-ray") {
    return "bluray";
  }

  if (isDvdFormatLabel(format) || fromSize === "DVD-ROM") {
    return "dvd";
  }

  if (platform === "ps1") {
    return "ps1-cd";
  }

  if (platform === "ps2") {
    if (isCdRomFormatLabel(format) || fromSize === "CD-ROM") {
      return "ps2-cd";
    }
    // Size / format unknown → honest generic, not a guessed blue or silver.
    return "generic";
  }

  if (isCdRomFormatLabel(format) || fromSize === "CD-ROM") {
    if (input.shelfType === "musics") return "audio-cd";
    return "generic";
  }

  if (input.shelfType === "musics") {
    return "audio-cd";
  }

  return "generic";
}
