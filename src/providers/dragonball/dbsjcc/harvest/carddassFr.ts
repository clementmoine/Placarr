/**
 * Complément FR officiel Bandai — archives carddass.fr/dbz (Wayback scout).
 * N’écrase pas dbzcollection : ledger + install `art.carddass.jpg` sous lang=fr.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { dbsJccCuratedDir } from "../pack";
import { parseDbsjccNumber } from "../printKey";
import {
  matchChitoroshopToDbsjccPrint,
  type DbsjccPrintCandidate,
} from "./chitoroshop";

/** FR official never mints — only match an existing print or skip. */
export type CarddassFrMatchResult =
  | { kind: "match"; print: DbsjccPrintCandidate }
  | { kind: "skip"; reason: string };

export type CarddassFrDbzFace = {
  series: string;
  file: string;
  waybackUrl: string;
  timestamp: string;
  /**
   * Optional site subfolder under `cartes/{series}/`
   * (`JPEG`, `CHARACTER`, `ACTION`, `BALL`, `SHENRON`).
   */
  category?: string | null;
};

/** Subfolders used by carddass.fr under `images/cartes/{n}/`. */
const CARD_IMAGE_SUBDIRS = "JPEG|CHARACTER|ACTION|BALL|SHENRON";

/**
 * Parse a carddass.fr card image pathname into series + file.
 * Accepts flat `cartes/4/D-021.jpg`, `cartes/4/JPEG/…`, Part 3 category
 * folders (`CHARACTER` / `ACTION` / `BALL` / `SHENRON`), and Hors-série
 * promos (`cartes/Promos/SP-4.jpg`, `cartes/cartes_med/… SP-22.jpg`).
 */
export function parseCarddassFrCardImagePath(pathname: string): {
  series: string;
  file: string;
  category: string | null;
} | null {
  let path = pathname.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep raw */
  }
  const m = path.match(
    new RegExp(
      `\\/dbz\\/images\\/cartes\\/(\\d+)(?:\\/(${CARD_IMAGE_SUBDIRS}))?\\/([^/]+\\.(?:jpe?g|png|gif))$`,
      "i",
    ),
  );
  if (m) {
    return {
      series: m[1]!,
      category: m[2] ? m[2].toUpperCase() : null,
      file: m[3]!,
    };
  }
  // Hors-série SP: `Promos/SP-4.jpg` or captioned `cartes_med/DB Carte promo SP-22.jpg`.
  const promo = path.match(
    /\/dbz\/images\/cartes\/(?:Promos|cartes_med)\/([^/]+\.(?:jpe?g|png|gif))$/i,
  );
  if (!promo) return null;
  const file = promo[1]!;
  if (!/\bSP[-_]?\d+\b/i.test(file)) return null;
  return { series: "sp", category: null, file };
}

/** Parsed ledger file ready to match/install (plain faces only). */
export type CarddassFrInstallRow = {
  series: string;
  file: string;
  waybackUrl: string;
  printed: string;
  number: string;
  /** `part1`…`part10` when series is 1–10. */
  setHint: string;
};

export type CarddassFrFaceKind = "plain" | "pouvoir" | "unusable";

/** Site filename marker — not a kaio/enfer/main label. */
export type CarddassFrPouvoirMarker = "pa" | "pb" | "vc";

export type CarddassFrPouvoirMarkerRow = {
  series: string;
  setHint: string;
  printed: string;
  number: string;
  markers: CarddassFrPouvoirMarker[];
  files: Array<{
    marker: CarddassFrPouvoirMarker;
    file: string;
    waybackUrl: string;
    timestamp: string;
  }>;
};

/** Durable Wayback CDX scout — under provider curated (not `data/staging/`). */
const SCOUT_CDX = path.join(
  dbsJccCuratedDir(),
  "sources",
  "wayback",
  "carddass_fr_db_.json",
);

export function dbsJccCarddassFrLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "carddass-fr-dbz-faces.json");
}

export function dbsJccCarddassFrPouvoirMarkersPath(): string {
  return path.join(
    dbsJccCuratedDir(),
    "sources",
    "carddass-fr-dbz-pouvoir-markers.json",
  );
}

/**
 * carddass.fr series folder `1`…`10` → retail `part1`…`part10`.
 * Hors-série SP dumps use synthetic series `sp` (`Promos/` / `cartes_med/`).
 */
export function carddassFrSeriesToSetHint(series: string): string | null {
  const raw = series.trim().toLowerCase();
  if (raw === "sp" || raw === "promo") return "sp";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return `part${n}`;
}

function pouvoirMarkerFromRest(rest: string): CarddassFrPouvoirMarker | null {
  if (/(?:^|[\s_-])PA(?:$|[\s_-])/i.test(rest) || /\bPA\b/i.test(rest)) {
    return "pa";
  }
  if (/(?:^|[\s_-])PB(?:$|[\s_-])/i.test(rest) || /\bPB\b/i.test(rest)) {
    return "pb";
  }
  if (/(?:^|[\s_-])vc(?:$|[\s_-])/i.test(rest) || /\bvc\b/i.test(rest)) {
    return "vc";
  }
  return null;
}

/**
 * Classify a carddass.fr filename.
 * - `D-001.jpg` / `D728.jpg` / `D-099 copie.jpg` → plain (copie = re-upload)
 * - `D-021 PA copie.jpg` / `D-434-PB.jpg` / `D-662-vc.jpg` → pouvoir (skip)
 * - `.ai` / garbage → unusable
 *
 * PA/PB/vc mark that a scouter-zone scan exists on the site. They are **not**
 * Monde de kaio / Enfer / Main labels (faces stay unrevealed).
 */
/** Captioned med scans: `DB Carte promo SP-22` — noise around the collector token. */
function isCarddassFrPromoCaptionNoise(rest: string): boolean {
  const t = rest.trim().replace(/\s+/g, " ");
  if (!t) return true;
  if (/^copie$/i.test(t)) return true;
  return /^(?:db\s+)?carte\s+promo$/i.test(t);
}

export function parseCarddassFrFaceFile(file: string): {
  printed: string;
  number: string;
  kind: CarddassFrFaceKind;
  marker: CarddassFrPouvoirMarker | null;
} | null {
  const trimmed = file.trim();
  if (!trimmed) return null;
  const ext = (trimmed.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
  if (ext === "ai") {
    return null;
  }
  const base = trimmed.replace(/\.[^.]+$/, "");
  const leading = base.match(/^((?:SP|D)[-_]?\d+)(.*)$/i);
  const embedded = leading
    ? null
    : base.match(/\b((?:SP|D)[-_]?\d+)\b/i);
  const token = leading?.[1] ?? embedded?.[1];
  if (!token) return null;
  const number = parseDbsjccNumber(token);
  if (!number) return null;
  const prefix = number.startsWith("sp") ? "SP" : "D";
  const n = Number.parseInt(number.replace(/^[a-z]+/, ""), 10);
  const printed = `${prefix}-${n}`;
  let rest: string;
  if (leading) {
    rest = leading[2]!.trim();
  } else {
    const idx = embedded!.index ?? 0;
    const before = base.slice(0, idx).trim();
    const after = base.slice(idx + embedded![0]!.length).trim();
    rest = [before, after].filter(Boolean).join(" ");
  }

  if (isCarddassFrPromoCaptionNoise(rest)) {
    return { printed, number, kind: "plain", marker: null };
  }
  const marker = pouvoirMarkerFromRest(rest);
  if (marker) {
    return { printed, number, kind: "pouvoir", marker };
  }
  return { printed, number, kind: "unusable", marker: null };
}

/**
 * Build durable PA/PB/vc marker rows from the face ledger.
 * Attests “this reprint has a pouvoir-tagged scan on carddass.fr” — never invents
 * the hidden-power label.
 */
export function buildCarddassFrPouvoirMarkers(
  faces: readonly CarddassFrDbzFace[],
): CarddassFrPouvoirMarkerRow[] {
  const byKey = new Map<string, CarddassFrPouvoirMarkerRow>();
  for (const face of faces) {
    const setHint = carddassFrSeriesToSetHint(face.series);
    if (!setHint) continue;
    const parsed = parseCarddassFrFaceFile(face.file);
    if (!parsed || parsed.kind !== "pouvoir" || !parsed.marker) continue;
    const key = `${face.series}:${parsed.number}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        series: face.series,
        setHint,
        printed: parsed.printed,
        number: parsed.number,
        markers: [],
        files: [],
      };
      byKey.set(key, row);
    }
    if (!row.markers.includes(parsed.marker)) {
      row.markers.push(parsed.marker);
      row.markers.sort();
    }
    row.files.push({
      marker: parsed.marker,
      file: face.file,
      waybackUrl: face.waybackUrl,
      timestamp: face.timestamp,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.setHint.localeCompare(b.setHint) || a.number.localeCompare(b.number),
  );
}

/** Prefer exact `D-###.jpg` over `D###.jpg` over `… copie.jpg`. */
function plainFaceQuality(file: string): number {
  if (/^(?:SP|D)-\d+\.(?:jpe?g|png|gif)$/i.test(file)) return 0;
  if (/^(?:SP|D)\d+\.(?:jpe?g|png|gif)$/i.test(file)) return 1;
  if (/copie/i.test(file)) return 2;
  return 3;
}

/**
 * Dedup ledger rows to one plain face per (series, number).
 * Skips pouvoirs / unusable; prefers the cleanest filename.
 */
export function selectCarddassFrInstallRows(
  faces: readonly CarddassFrDbzFace[],
): CarddassFrInstallRow[] {
  const best = new Map<string, CarddassFrInstallRow & { quality: number }>();

  for (const face of faces) {
    const setHint = carddassFrSeriesToSetHint(face.series);
    if (!setHint) continue;
    const parsed = parseCarddassFrFaceFile(face.file);
    if (!parsed || parsed.kind !== "plain") continue;

    const key = `${face.series}:${parsed.number}`;
    const quality = plainFaceQuality(face.file);
    const prev = best.get(key);
    if (prev && prev.quality <= quality) continue;

    best.set(key, {
      series: face.series,
      file: face.file,
      waybackUrl: face.waybackUrl,
      printed: parsed.printed,
      number: parsed.number,
      setHint,
      quality,
    });
  }

  return [...best.values()]
    .map(({ quality: _q, ...row }) => row)
    .sort(
      (a, b) =>
        a.setHint.localeCompare(b.setHint) ||
        a.number.localeCompare(b.number),
    );
}

/**
 * Same set/pouvoir rules as Chitoroshop, but never mint — FR official must
 * land on an existing dbzcollection print.
 */
export function matchCarddassFrToDbsjccPrint(
  number: string,
  setHint: string | null,
  candidates: readonly DbsjccPrintCandidate[],
): CarddassFrMatchResult {
  const decision = matchChitoroshopToDbsjccPrint(number, setHint, candidates);
  if (decision.kind === "mint") {
    return {
      kind: "skip",
      reason: `no FR print for ${number} in ${decision.setCode}`,
    };
  }
  return decision;
}

/** Parse CDX scout rows into FR face ledger under curated/sources. */
export function buildCarddassFrDbzLedgerFromScout(): {
  faces: CarddassFrDbzFace[];
  outPath: string;
  markers: CarddassFrPouvoirMarkerRow[];
  markersPath: string;
} {
  const outPath = dbsJccCarddassFrLedgerPath();
  const markersPath = dbsJccCarddassFrPouvoirMarkersPath();
  mkdirSync(path.dirname(outPath), { recursive: true });

  if (!existsSync(SCOUT_CDX)) {
    const empty = {
      source: "carddass.fr/dbz Wayback CDX",
      lang: "fr",
      observed: new Date().toISOString().slice(0, 10),
      note: "Scout missing — run CDX scout first",
      faces: [] as CarddassFrDbzFace[],
    };
    writeFileSync(outPath, `${JSON.stringify(empty, null, 2)}\n`, "utf8");
    writeFileSync(
      markersPath,
      `${JSON.stringify(
        {
          source: "carddass.fr/dbz Wayback — PA/PB/vc filenames",
          lang: "fr",
          observed: new Date().toISOString().slice(0, 10),
          note: "Scout missing — run CDX scout first",
          markers: [] as CarddassFrPouvoirMarkerRow[],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return { faces: [], outPath, markers: [], markersPath };
  }

  const rows = JSON.parse(readFileSync(SCOUT_CDX, "utf8")) as Array<{
    timestamp: string;
    original: string;
  }>;

  const faces: CarddassFrDbzFace[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    let pathname = "";
    try {
      pathname = new URL(row.original).pathname;
    } catch {
      continue;
    }
    const parsed = parseCarddassFrCardImagePath(pathname);
    if (!parsed) continue;
    const key = `${parsed.series}/${parsed.file.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    faces.push({
      series: parsed.series,
      file: parsed.file,
      category: parsed.category,
      timestamp: row.timestamp,
      waybackUrl: `https://web.archive.org/web/${row.timestamp}id_/${row.original}`,
    });
  }

  faces.sort((a, b) =>
    a.series.localeCompare(b.series) || a.file.localeCompare(b.file),
  );

  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        source: "carddass.fr/dbz Wayback CDX",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        url: "http://www.carddass.fr/dbz/",
        faces,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const markers = buildCarddassFrPouvoirMarkers(faces);
  writeFileSync(
    markersPath,
    `${JSON.stringify(
      {
        source: "carddass.fr/dbz Wayback — PA/PB/vc filenames",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        note:
          "Filename markers only. Faces are still unrevealed (red DRAGON BALL zone). Does not map to Monde de kaio / Enfer / Main.",
        markers,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { faces, outPath, markers, markersPath };
}

export function harvestCarddassFrDbz(): {
  faces: number;
  path: string;
  pouvoirMarkers: number;
  pouvoirMarkersPath: string;
} {
  const { faces, outPath, markers, markersPath } =
    buildCarddassFrDbzLedgerFromScout();
  return {
    faces: faces.length,
    path: outPath,
    pouvoirMarkers: markers.length,
    pouvoirMarkersPath: markersPath,
  };
}
