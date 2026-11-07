/**
 * LDDb catalog formats (main site nav).
 *
 * Magazines live on `magazines.lddb.com` as a PDF archive — not title/cover
 * records — so they are intentionally absent from this table.
 */

export type LddbFormatId = "ld" | "vhd" | "ced" | "dvhs" | "hddvd";

export type LddbFormat = {
  id: LddbFormatId;
  /** Display label for facts / notes. */
  label: string;
  /** Title URL segment (`/laserdisc/…`, `/vhd/…`, …). */
  pathSegment: string;
  /** Cover tree under `/cover/{coverPrefix}/…`. */
  coverPrefix: string;
  /** `search.php?format=` value. */
  searchFormat: string;
  /**
   * Normalized shelf-name substrings (accents stripped, non-alnum removed)
   * that select this format for title-search. Exact tokens use `=token`.
   */
  shelfHints: readonly string[];
};

export const LDDB_FORMATS: readonly LddbFormat[] = [
  {
    id: "ld",
    label: "LaserDisc",
    pathSegment: "laserdisc",
    coverPrefix: "ld",
    searchFormat: "ld",
    shelfHints: ["laserdisc", "laserdisk", "=ld"],
  },
  {
    id: "vhd",
    label: "VHD",
    pathSegment: "vhd",
    coverPrefix: "vhd",
    searchFormat: "vhd",
    shelfHints: ["=vhd", "victorvhd"],
  },
  {
    id: "ced",
    label: "CED",
    pathSegment: "ced",
    coverPrefix: "ced",
    searchFormat: "ced",
    shelfHints: ["=ced", "capacitanceelectronicdisc"],
  },
  {
    id: "dvhs",
    label: "D-VHS",
    pathSegment: "dvhs",
    coverPrefix: "dvhs",
    searchFormat: "dvhs",
    shelfHints: ["dvhs", "dtheater", "dtheatre"],
  },
  {
    id: "hddvd",
    label: "HD-DVD",
    pathSegment: "hddvd",
    coverPrefix: "hddvd",
    searchFormat: "hddvd",
    shelfHints: ["hddvd", "highdefinitiondvd"],
  },
] as const;

const BY_ID = new Map(LDDB_FORMATS.map((f) => [f.id, f]));
const BY_PATH = new Map(
  LDDB_FORMATS.map((f) => [f.pathSegment.toLowerCase(), f]),
);

/** Path segments joined for link regexes: `laserdisc|vhd|ced|dvhs|hddvd`. */
export const LDDB_PATH_SEGMENT_RE = LDDB_FORMATS.map((f) => f.pathSegment).join(
  "|",
);

export function lddbFormatById(id: string): LddbFormat | null {
  return BY_ID.get(id as LddbFormatId) ?? null;
}

export function lddbFormatFromPathSegment(
  segment: string,
): LddbFormat | null {
  return BY_PATH.get(segment.toLowerCase()) ?? null;
}

export function normalizeLddbShelfKey(shelfName?: string | null): string {
  return (shelfName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hintMatches(normalizedShelf: string, hint: string): boolean {
  if (hint.startsWith("=")) {
    return normalizedShelf === hint.slice(1);
  }
  return normalizedShelf.includes(hint);
}

/** Format implied by the shelf name, or null when title-search should stay off. */
export function shelfSuggestsLddbFormat(
  shelfName?: string | null,
): LddbFormat | null {
  const key = normalizeLddbShelfKey(shelfName);
  if (!key) return null;
  for (const format of LDDB_FORMATS) {
    if (format.shelfHints.some((hint) => hintMatches(key, hint))) {
      return format;
    }
  }
  return null;
}

/** True when the shelf is an LDDb video format (not Magazines PDF archive). */
export function shelfSuggestsLddbCatalog(shelfName?: string | null): boolean {
  return shelfSuggestsLddbFormat(shelfName) != null;
}

/** @deprecated use {@link shelfSuggestsLddbFormat} / {@link shelfSuggestsLddbCatalog} */
export function shelfSuggestsLaserDisc(shelfName?: string | null): boolean {
  return shelfSuggestsLddbFormat(shelfName)?.id === "ld";
}
