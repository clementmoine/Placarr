/**
 * Complément FR officiel Bandai — archives carddass.fr/dbz (Wayback scout).
 * N’écrase pas dbzcollection : ajoute des notes/ledger pour faces FR CDN.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { dbsJccCuratedDir } from "../pack";

export type CarddassFrDbzFace = {
  series: string;
  file: string;
  waybackUrl: string;
  timestamp: string;
};

const SCOUT_CDX = path.join(
  process.cwd(),
  "data/staging/carddass-wayback-scout/carddass_fr_db_.json",
);

/** Parse CDX scout rows into FR face ledger under curated/sources. */
export function buildCarddassFrDbzLedgerFromScout(): {
  faces: CarddassFrDbzFace[];
  outPath: string;
} {
  const outPath = path.join(
    dbsJccCuratedDir(),
    "sources",
    "carddass-fr-dbz-faces.json",
  );
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
