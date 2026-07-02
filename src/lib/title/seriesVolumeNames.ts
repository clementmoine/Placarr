export const SERIES_VOLUME_PATTERNS = {
  tome_nn: "{title} Tome {nn}",
  numero_nn: "{title} n°{nn}",
  numero_label_nn: "{title} Numéro {nn}",
  vol_n: "{title} Vol. {n}",
  chapitre_nn: "{title} Chapitre {nn}",
  hash_nn: "{title} #{nn}",
} as const;

export type SeriesVolumePatternKey = keyof typeof SERIES_VOLUME_PATTERNS;

const PATTERN_SAMPLE_TITLE = "Naruto";

export function previewSeriesPatternLabel(
  patternKey: SeriesVolumePatternKey,
  title: string,
  rangeEnd = 1,
): string {
  const displayTitle = title.trim() || PATTERN_SAMPLE_TITLE;
  const end = Math.max(parseSeriesVolume(rangeEnd) ?? 1, 1);
  return buildSeriesItemName(
    SERIES_VOLUME_PATTERNS[patternKey],
    displayTitle,
    1,
    end,
  );
}

export function parseSeriesVolume(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function countSeriesVolumes(
  from: unknown,
  to: unknown,
): number {
  const fromVolume = parseSeriesVolume(from);
  const toVolume = parseSeriesVolume(to);
  if (fromVolume === null || toVolume === null || toVolume < fromVolume) {
    return 0;
  }
  return toVolume - fromVolume + 1;
}

/**
 * Zero-padding width for `{nn}`, aligned to the widest volume in the range: a
 * series ending at 9 stays single-digit, at 10 pads to 2 (01–10), at 100 pads to
 * 3 (001–100). Width = digit count of the highest volume, no floor — matching the
 * series *display* padding (`seriesVolumeDisplayWidth`).
 */
export function seriesVolumePaddingWidth(rangeEnd: number): number {
  return String(Math.max(1, Math.trunc(rangeEnd))).length;
}

export function buildSeriesItemName(
  pattern: string,
  title: string,
  volume: number,
  rangeEnd: number,
): string {
  const trimmedTitle = title.trim();
  const width = seriesVolumePaddingWidth(rangeEnd);
  const nn = String(volume).padStart(width, "0");
  const n = String(volume);

  return pattern
    .replaceAll("{title}", trimmedTitle)
    .replaceAll("{nn}", nn)
    .replaceAll("{n}", n)
    .replace(/\s+/g, " ")
    .trim();
}

export function expandSeriesVolumeNames(
  title: string,
  from: number,
  to: number,
  pattern: string,
): string[] {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Series title is required");
  }
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < from
  ) {
    throw new Error("Invalid volume range");
  }

  const count = to - from + 1;

  return Array.from({ length: count }, (_, index) =>
    buildSeriesItemName(pattern, trimmedTitle, from + index, to),
  );
}
