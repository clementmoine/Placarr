/**
 * Bare and volume-suffixed numbers extracted from titles.
 */
import {
  normalizeVolumeNumber,
  normalizeVolumeTitleText,
  VOLUME_NUMBER_SUFFIX_PATTERN,
} from "@/core/enrich/titles/volumeNumber";

export function normalizeEditionNumber(value: string): string {
  return String(Number.parseInt(value, 10));
}

const SUFFIXED_NUMBER_RE = new RegExp(
  `\\d+(?:\\s?${VOLUME_NUMBER_SUFFIX_PATTERN})?`,
  "g",
);

export function allNumbers(value: string): string[] {
  return Array.from(
    new Set(
      (normalizeVolumeTitleText(value).match(SUFFIXED_NUMBER_RE) || [])
        .map(normalizeVolumeNumber)
        .filter((number) => number !== "NaN"),
    ),
  );
}

