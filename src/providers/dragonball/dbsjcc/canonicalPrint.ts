/**
 * Une face = une printKey ; multi-série via `print_sets` quand le hash art
 * est le même. Lettres a/b/c quand un même D-/SP- a plusieurs illustrations.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";

import { DBS_JCC_PACK_ID } from "./pack";
import {
  dbsjccPrintKey,
  dbsjccSetSortKey,
  normalizeGrouping,
  parseDbsjccNumber,
  splitDbsjccNumber,
} from "./printKey";

const ART_LETTERS = "abcdefghijklmnopqrstuvwxyz";

export type DbsjccFaceCandidate = {
  setCode: string;
  /** Disk number without art letter (`d0123`), or printed `D-123`. */
  number: string;
  /** Pouvoir caché (kaio / enfer…) — pas la lettre d'art. */
  powerGrouping?: string | null;
  /** sha256 hex (or prefix) of the preferred FR face file. */
  artHash: string;
};

export type DbsjccCanonicalPrint = {
  printKey: string;
  homeSet: string;
  /** Stored number including art letter when needed (`d0123b`). */
  number: string;
  /** Power grouping only (kaio…); art letter lives in `number`. */
  grouping: string | null;
  artLetter: string | null;
  setCodes: string[];
  /** Legacy keys that collapse onto this print. */
  aliasPrintKeys: string[];
};

function baseNumber(raw: string): string | null {
  const split = splitDbsjccNumber(raw);
  return split?.base ?? null;
}

function withArtLetter(number: string, letter: string | null): string {
  const base = baseNumber(number);
  if (!base) return number.trim().toLowerCase();
  if (!letter) return base;
  return `${base}${letter.toLowerCase()}`;
}

function setRank(setCode: string): number {
  const key = setCode.trim().toLowerCase();
  const sort = dbsjccSetSortKey(key);
  if (sort != null) return sort;
  return 1000 + key.localeCompare("zzz");
}

function identityKey(number: string, power: string | null): string {
  return `${baseNumber(number) ?? number}|${power ?? ""}`;
}

/**
 * Cluster face candidates → canonical prints.
 *
 * Same art hash across sets → one key + `setCodes`. Distinct hashes for the
 * same collector number → letters a/b/c (omitted when only one family).
 */
export function clusterDbsjccCanonicalPrints(
  candidates: readonly DbsjccFaceCandidate[],
): DbsjccCanonicalPrint[] {
  type Bucket = {
    setCode: string;
    number: string;
    power: string | null;
    artHash: string;
  };
  const buckets: Bucket[] = [];
  for (const row of candidates) {
    const number = baseNumber(row.number);
    if (!number) continue;
    const setCode = row.setCode.trim().toLowerCase();
    const power = row.powerGrouping
      ? normalizeGrouping(row.powerGrouping)
      : null;
    const artHash = row.artHash.trim().toLowerCase();
    if (!setCode || !artHash) continue;
    buckets.push({ setCode, number, power, artHash });
  }

  const byIdentity = new Map<string, Bucket[]>();
  for (const row of buckets) {
    const key = identityKey(row.number, row.power);
    const list = byIdentity.get(key) ?? [];
    list.push(row);
    byIdentity.set(key, list);
  }

  const out: DbsjccCanonicalPrint[] = [];
  for (const [, rows] of byIdentity) {
    const byHash = new Map<string, Bucket[]>();
    for (const row of rows) {
      const list = byHash.get(row.artHash) ?? [];
      list.push(row);
      byHash.set(row.artHash, list);
    }

    const clusters = [...byHash.entries()]
      .map(([artHash, members]) => {
        const sets = [
          ...new Set(members.map((m) => m.setCode)),
        ].sort((a, b) => setRank(a) - setRank(b) || a.localeCompare(b));
        return {
          artHash,
          sets,
          homeSet: sets[0]!,
          number: members[0]!.number,
          power: members[0]!.power,
          earliest: setRank(sets[0]!),
        };
      })
      .sort(
        (a, b) =>
          a.earliest - b.earliest ||
          a.homeSet.localeCompare(b.homeSet) ||
          a.artHash.localeCompare(b.artHash),
      );

    const multi = clusters.length > 1;
    clusters.forEach((cluster, index) => {
      const artLetter = multi ? ART_LETTERS[index] ?? `x${index}` : null;
      const storedNumber = withArtLetter(cluster.number, artLetter);
      const printKey = dbsjccPrintKey(
        cluster.homeSet,
        storedNumber,
        cluster.power,
      );
      if (!printKey) return;

      const aliasPrintKeys = new Set<string>();
      for (const setCode of cluster.sets) {
        const bare = dbsjccPrintKey(setCode, cluster.number, cluster.power);
        if (bare) aliasPrintKeys.add(bare);
        if (artLetter) {
          const lettered = dbsjccPrintKey(
            setCode,
            withArtLetter(cluster.number, artLetter),
            cluster.power,
          );
          if (lettered) aliasPrintKeys.add(lettered);
        }
      }
      aliasPrintKeys.delete(printKey);

      out.push({
        printKey,
        homeSet: cluster.homeSet,
        number: storedNumber,
        grouping: cluster.power,
        artLetter,
        setCodes: cluster.sets,
        aliasPrintKeys: [...aliasPrintKeys].sort(),
      });
    });
  }

  return out.sort((a, b) => a.printKey.localeCompare(b.printKey));
}

/** Prefer dbzcollection face, then any `art.*` in the card folder. */
export function preferredFaceFile(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  let names: string[];
  try {
    names = readdirSync(cardDir);
  } catch {
    return null;
  }
  const arts = names.filter((name) => /^art\./i.test(name));
  if (arts.length === 0) return null;
  const preferred =
    arts.find((name) => /dbzcollection/i.test(name)) ??
    arts.find((name) => /carddass/i.test(name)) ??
    arts.sort()[0]!;
  return path.join(cardDir, preferred);
}

export function hashFileSha256(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Parse a card folder name (`d0123`, `d0123b`, `d0437-kaio`) into base number
 * + power grouping. Art letters are stripped so re-scans stay idempotent.
 */
export function parseDbsjccCardFolder(folder: string): {
  number: string;
  powerGrouping: string | null;
} | null {
  const trimmed = folder.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith(".")) return null;
  const m = /^(.+?)(?:-(.+))?$/i.exec(trimmed);
  if (!m) return null;
  const rawNumber = m[1]!;
  if (rawNumber === "detecteur") {
    return {
      number: "detecteur",
      powerGrouping: m[2] ? normalizeGrouping(m[2]) : null,
    };
  }
  const base = baseNumber(rawNumber);
  if (!base) return null;
  return {
    number: base,
    powerGrouping: m[2] ? normalizeGrouping(m[2]) : null,
  };
}

/**
 * Scan `data/dragonball/jcc/cards/{set}/fr/{number[-grouping]}/` for face hashes.
 */
export function scanDbsjccFaceCandidates(
  packId: string = DBS_JCC_PACK_ID,
): DbsjccFaceCandidate[] {
  const cardsRoot = packCardsDir(packId);
  if (!existsSync(cardsRoot)) return [];
  const out: DbsjccFaceCandidate[] = [];
  for (const setCode of readdirSync(cardsRoot)) {
    if (setCode.startsWith(".")) continue;
    if (/\./.test(setCode)) continue; // back.webp at cards root
    const frRoot = path.join(cardsRoot, setCode, "fr");
    if (!existsSync(frRoot)) continue;
    for (const folder of readdirSync(frRoot)) {
      const parsed = parseDbsjccCardFolder(folder);
      if (!parsed) continue;
      const face = preferredFaceFile(path.join(frRoot, folder));
      if (!face) continue;
      const artHash = hashFileSha256(face);
      if (!artHash) continue;
      out.push({
        setCode,
        number: parsed.number,
        powerGrouping: parsed.powerGrouping,
        artHash,
      });
    }
  }
  return out;
}

export function buildDbsjccCanonicalMap(
  candidates?: readonly DbsjccFaceCandidate[],
): {
  byPrintKey: Map<string, DbsjccCanonicalPrint>;
  aliasToCanonical: Map<string, string>;
  prints: DbsjccCanonicalPrint[];
} {
  const prints = clusterDbsjccCanonicalPrints(
    candidates ?? scanDbsjccFaceCandidates(),
  );
  const byPrintKey = new Map<string, DbsjccCanonicalPrint>();
  const aliasToCanonical = new Map<string, string>();
  for (const print of prints) {
    byPrintKey.set(print.printKey, print);
    aliasToCanonical.set(print.printKey, print.printKey);
    for (const alias of print.aliasPrintKeys) {
      aliasToCanonical.set(alias, print.printKey);
    }
  }
  return { byPrintKey, aliasToCanonical, prints };
}

/** Resolve a listing set + number to the canonical print for that art family. */
export function resolveCanonicalForListing(input: {
  setCode: string;
  number: string;
  powerGrouping?: string | null;
  catalogue?: ReturnType<typeof buildDbsjccCanonicalMap>;
}): DbsjccCanonicalPrint | null {
  const catalogue = input.catalogue ?? buildDbsjccCanonicalMap();
  const setCode = input.setCode.trim().toLowerCase();
  const number = baseNumber(input.number);
  if (!number) return null;
  const power = input.powerGrouping
    ? normalizeGrouping(input.powerGrouping)
    : null;

  const match = catalogue.prints.find((print) => {
    const base = baseNumber(print.number);
    if (base !== number) return false;
    if ((print.grouping ?? null) !== (power ?? null)) return false;
    return print.setCodes.includes(setCode);
  });
  if (match) return match;

  const key = dbsjccPrintKey(setCode, number, power);
  if (!key) return null;
  return (
    catalogue.byPrintKey.get(key) ?? {
      printKey: key,
      homeSet: setCode,
      number,
      grouping: power,
      artLetter: null,
      setCodes: [setCode],
      aliasPrintKeys: [],
    }
  );
}

export { baseNumber as dbsjccBaseNumber, withArtLetter as dbsjccWithArtLetter };
