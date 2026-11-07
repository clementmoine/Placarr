/**
 * LDDb cover URL helpers — IDs live in 100-wide buckets on disk.
 * Front:  /cover/{prefix}/{start}-{end}/{id}.jpg
 * Back:   /cover/{prefix}/{start}-{end}/{id}_back.jpg
 * Thumb:  /cover/{prefix}/{start}-{end}/thumb/{id}.jpg
 *
 * LaserDisc uses cover prefix `ld` with path `/laserdisc/…`; other formats
 * share the same segment for path + cover (`vhd`, `ced`, `dvhs`, `hddvd`).
 */

import {
  LDDB_PATH_SEGMENT_RE,
  lddbFormatById,
  lddbFormatFromPathSegment,
  type LddbFormat,
  type LddbFormatId,
} from "./formats";

export {
  shelfSuggestsLaserDisc,
  shelfSuggestsLddbCatalog,
  shelfSuggestsLddbFormat,
} from "./formats";

const LDDB_ORIGIN = "https://www.lddb.com";

export function lddbCoverBucket(id: number): { start: number; end: number } {
  const start = Math.floor((id - 1) / 100) * 100 + 1;
  return { start, end: start + 99 };
}

export function lddbCoverUrls(
  id: number | string,
  format: LddbFormat | LddbFormatId = "ld",
): {
  front: string;
  back: string;
  thumb: string;
} | null {
  const numeric = typeof id === "number" ? id : Number.parseInt(String(id), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const resolved =
    typeof format === "string" ? lddbFormatById(format) : format;
  if (!resolved) return null;
  const padded = String(Math.trunc(numeric)).padStart(5, "0");
  const { start, end } = lddbCoverBucket(numeric);
  const base = `${LDDB_ORIGIN}/cover/${resolved.coverPrefix}/${String(start).padStart(5, "0")}-${String(end).padStart(5, "0")}`;
  return {
    front: `${base}/${padded}.jpg`,
    back: `${base}/${padded}_back.jpg`,
    thumb: `${base}/thumb/${padded}.jpg`,
  };
}

export type LddbPathRef = {
  id: string;
  format: LddbFormat;
};

export function lddbRefFromPath(pathOrUrl: string): LddbPathRef | null {
  const re = new RegExp(
    `\\/(${LDDB_PATH_SEGMENT_RE})\\/(\\d+)(?:\\/|$)`,
    "i",
  );
  const match = re.exec(pathOrUrl);
  if (!match?.[1] || !match[2]) return null;
  const format = lddbFormatFromPathSegment(match[1]);
  if (!format) return null;
  return { id: match[2], format };
}

/** Numeric id only (any catalog format). */
export function lddbIdFromPath(pathOrUrl: string): string | null {
  return lddbRefFromPath(pathOrUrl)?.id ?? null;
}
