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
  type ChitoroshopMatchResult,
  type DbsjccPrintCandidate,
} from "./chitoroshop";

export type CarddassFrDbzFace = {
  series: string;
  file: string;
  waybackUrl: string;
  timestamp: string;
};

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

/**
 * carddass.fr series folder `1`…`10` → retail `part1`…`part10`.
 * Other folders (promo, etc.) are not attested in this scout dump.
 */
export function carddassFrSeriesToSetHint(series: string): string | null {
  const n = Number.parseInt(series.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return `part${n}`;
}

/**
 * Classify a carddass.fr filename.
 * - `D-001.jpg` / `D728.jpg` / `D-099 copie.jpg` → plain (copie = re-upload)
 * - `D-021 PA copie.jpg` / `D-434-PB.jpg` / `D-662-vc.jpg` → pouvoir (skip)
 * - `.ai` / garbage → unusable
 */
export function parseCarddassFrFaceFile(
  file: string,
): { printed: string; number: string; kind: CarddassFrFaceKind } | null {
  const trimmed = file.trim();
  if (!trimmed) return null;
  const ext = (trimmed.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
  if (ext === "ai") {
    return null;
  }
  const base = trimmed.replace(/\.[^.]+$/, "");
  const m = base.match(/^((?:SP|D)[-_]?\d+)(.*)$/i);
  if (!m) return null;
  const number = parseDbsjccNumber(m[1]!);
  if (!number) return null;
  const prefix = number.startsWith("sp") ? "SP" : "D";
  const n = Number.parseInt(number.replace(/^[a-z]+/, ""), 10);
  const printed = `${prefix}-${n}`;
  const rest = m[2]!.trim();

  if (!rest || /^copie$/i.test(rest)) {
    return { printed, number, kind: "plain" };
  }
  // Pouvoir / variant markers (PA, PB, vc) — ambiguous vs FR grouping.
  if (/(?:^|[\s_-])(?:PA|PB|vc)(?:$|[\s_-])/i.test(rest) || /(?:PA|PB|vc)/i.test(rest)) {
    return { printed, number, kind: "pouvoir" };
  }
  return { printed, number, kind: "unusable" };
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
): ChitoroshopMatchResult {
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
} {
  const outPath = dbsJccCarddassFrLedgerPath();
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
    return { faces: [], outPath };
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
      pathname = decodeURIComponent(new URL(row.original).pathname);
    } catch {
      continue;
    }
    const m = pathname.match(
      /\/dbz\/images\/cartes\/(\d+)(?:\/JPEG)?\/([^/]+\.(?:jpe?g|png|gif))$/i,
    );
    if (!m) continue;
    const series = m[1]!;
    const file = m[2]!;
    const key = `${series}/${file.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    faces.push({
      series,
      file,
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
  return { faces, outPath };
}

export function harvestCarddassFrDbz(): { faces: number; path: string } {
  const { faces, outPath } = buildCarddassFrDbzLedgerFromScout();
  return { faces: faces.length, path: outPath };
}
