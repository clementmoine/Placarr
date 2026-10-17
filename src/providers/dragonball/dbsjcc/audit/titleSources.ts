/**
 * Compare les titres FR du catalogue local aux ledgers attestés
 * (carddass.fr Wayback, dbzcollection Nom, Hatatoy JA / Chitoroshop EN).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { DatabaseSync } from "node:sqlite";

import { packCatalogDb } from "@/lib/packPaths";

import type { CarddassFrNameRow } from "../harvest/carddassFrNames";
import { dbsJccCarddassFrNamesLedgerPath } from "../harvest/carddassFrNames";
import type { DbzcollectionNameRow } from "../harvest/dbzcollectionNames";
import { dbsJccDbzcollectionNamesLedgerPath } from "../harvest/dbzcollectionNames";
import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import {
  formatDbsjccCollectorReference,
  formatDbsjccReference,
} from "../printKey";

export type TitleAuditRow = {
  printKey: string;
  setCode: string;
  number: string;
  catalogTitle: string;
  sources: {
    dbzcollection?: string;
    carddassFr?: string;
    hatatoyJa?: string;
    chitoroshopEn?: string;
    part1SameNumber?: string;
  };
  flags: string[];
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function isWeakTitle(
  title: string,
  setCode: string,
  number: string,
): boolean {
  const t = title.trim();
  if (!t) return true;
  const collector = formatDbsjccCollectorReference(setCode, number);
  if (norm(t) === norm(collector)) return true;
  const setNum = setCode.replace(/^part/i, "");
  if (norm(t).startsWith(norm(`Part ${setNum}`))) return true;
  if (norm(t).startsWith(norm(`Série ${setNum}`))) return true;
  if (/^(?:part|série)\s+\d+\s+d-\d+/i.test(t)) return true;
  if (norm(t) === norm(formatDbsjccReference(setCode, collector))) return true;
  return false;
}

export function auditDbsjccFrTitles(opts?: {
  dbPath?: string;
}): TitleAuditRow[] {
  const dbPath = opts?.dbPath ?? packCatalogDb(DBS_JCC_PACK_ID);
  if (!existsSync(dbPath)) return [];

  const dbzcDoc = readJson<{ names?: DbzcollectionNameRow[] }>(
    dbsJccDbzcollectionNamesLedgerPath(),
  );
  const carddassDoc = readJson<{ names?: CarddassFrNameRow[] }>(
    dbsJccCarddassFrNamesLedgerPath(),
  );
  const hatatoyDoc = readJson<{
    faces?: Array<{
      number?: string;
      setHint?: string;
      titleJa?: string;
      title?: string;
    }>;
  }>(path.join(dbsJccCuratedDir(), "sources", "hatatoy.json"));
  const chitoroDoc = readJson<{
    faces?: Array<{
      number?: string;
      setHint?: string;
      title?: string;
    }>;
  }>(path.join(dbsJccCuratedDir(), "sources", "chitoroshop.json"));

  const dbzcByKey = new Map<string, string>();
  for (const row of dbzcDoc?.names ?? []) {
    dbzcByKey.set(`${row.setCode}:${row.number}`, row.name);
  }
  const carddassByNumber = new Map<string, string>();
  for (const row of carddassDoc?.names ?? []) {
    carddassByNumber.set(row.number, row.name);
  }
  const hatatoyByKey = new Map<string, string>();
  for (const row of hatatoyDoc?.faces ?? []) {
    const number = row.number?.trim().toLowerCase();
    const setHint = row.setHint?.trim().toLowerCase();
    const title = row.titleJa?.trim() || null;
    if (!number || !setHint || !title) continue;
    hatatoyByKey.set(`${setHint}:${number}`, title);
  }
  const chitoroByKey = new Map<string, string>();
  for (const row of chitoroDoc?.faces ?? []) {
    const number = row.number?.trim().toLowerCase();
    const setHint = row.setHint?.trim().toLowerCase();
    const title = row.title?.trim() || null;
    if (!number || !setHint || !title) continue;
    // "Five-Star Dragon Ball D-127 | Dragon Ball Card Game (Part 1)"
    const short = title.split("|")[0]?.trim() || title;
    chitoroByKey.set(`${setHint}:${number}`, short);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const catalog = db
      .prepare(
        `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number AS number,
                t.full_name AS title
           FROM prints p
           JOIN print_titles t ON t.print_key = p.print_key AND t.lang = 'fr'
          ORDER BY p.set_code, p.number`,
      )
      .all() as Array<{
      printKey: string;
      setCode: string;
      number: string;
      title: string;
    }>;

    const part1ByNumber = new Map<string, string>();
    for (const row of catalog) {
      if (row.setCode === "part1") part1ByNumber.set(row.number, row.title);
    }

    const out: TitleAuditRow[] = [];
    for (const row of catalog) {
      const key = `${row.setCode}:${row.number}`;
      const sources = {
        ...(dbzcByKey.has(key)
          ? { dbzcollection: dbzcByKey.get(key)! }
          : {}),
        ...(row.setCode === "part1" && carddassByNumber.has(row.number)
          ? { carddassFr: carddassByNumber.get(row.number)! }
          : {}),
        ...(hatatoyByKey.has(key)
          ? { hatatoyJa: hatatoyByKey.get(key)! }
          : {}),
        ...(chitoroByKey.has(key)
          ? { chitoroshopEn: chitoroByKey.get(key)! }
          : {}),
        ...(row.setCode !== "part1" && part1ByNumber.has(row.number)
          ? { part1SameNumber: part1ByNumber.get(row.number)! }
          : {}),
      };
      const flags: string[] = [];
      if (isWeakTitle(row.title, row.setCode, row.number)) {
        flags.push("weak-catalog-title");
      }
      if (
        sources.dbzcollection &&
        norm(sources.dbzcollection) !== norm(row.title)
      ) {
        flags.push("differs-dbzcollection");
      }
      if (
        sources.carddassFr &&
        norm(sources.carddassFr) !== norm(row.title)
      ) {
        flags.push("differs-carddass-fr");
      }
      if (
        !sources.dbzcollection &&
        sources.part1SameNumber &&
        isWeakTitle(row.title, row.setCode, row.number) &&
        norm(sources.part1SameNumber) !== norm(row.title)
      ) {
        flags.push("can-borrow-part1");
      }
      if (
        !sources.dbzcollection &&
        sources.carddassFr &&
        isWeakTitle(row.title, row.setCode, row.number)
      ) {
        flags.push("can-borrow-carddass-fr");
      }
      if (flags.length === 0) continue;
      out.push({
        printKey: row.printKey,
        setCode: row.setCode,
        number: row.number,
        catalogTitle: row.title,
        sources,
        flags,
      });
    }
    return out;
  } finally {
    db.close();
  }
}
