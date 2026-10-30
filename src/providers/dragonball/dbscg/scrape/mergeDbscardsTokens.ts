/**
 * Jetons Masters (TK-###) absents du cardlist Bandai — comblés depuis
 * `dbscards-{fr,en}.json` déjà moissonné.
 *
 * Bandai n'expose aucune série « Jeton » dans `category_exp` ; dbscards porte
 * TK-01… (Jeton Ombre, …) avec faces. Sans ce merge, le catalogue ignore les
 * jetons physiques que le joueur a en main.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { foilPackDataDir } from "@/lib/runtimeData";
import { dbscardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";
import type { DbscardsIndexEntry } from "@/providers/shared/tcgcards/list";

import type { DbsParsedCard } from "../parse/cardlist";
import {
  DBS_CG_GAME,
  dbsPrintKey,
  formatDbsCollectorNumber,
  parseDbsCollectorNumber,
} from "../identity";
import { DBS_CG_PACK_ID } from "../indexStore";

const DBSCARDS_ORIGIN = "https://www.dbscards.fr";

/** `tk-01` / `TK-010` / `tk-11` → `TK-001` / `TK-010` / `TK-011`. */
export function normalizeDbscardsTkRef(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const match = /^tk-0*(\d+)$/i.exec(trimmed);
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatDbsCollectorNumber("tk", String(n).padStart(3, "0"));
}

function isPreferableTokenTitle(name: string): boolean {
  const lower = name.toLowerCase();
  return !(
    lower.includes("championship") ||
    lower.includes(" vol.") ||
    /\bv\d\b/i.test(name) ||
    lower.includes("(android")
  );
}

function scoreTokenEntry(entry: DbscardsIndexEntry): number {
  let score = 0;
  if (entry.imageFront) score += 4;
  if (isPreferableTokenTitle(entry.name)) score += 2;
  if (entry.slug && !/-(?:v\d|championship)/i.test(entry.slug)) score += 1;
  return score;
}

function loadDbscardsIndex(lang: "fr" | "en"): DbscardsIndexEntry[] {
  const file = dbscardsIndexPath(DBS_CG_PACK_ID, lang);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as DbscardsIndexEntry[]) : [];
  } catch {
    return [];
  }
}

type TokenBucket = {
  printed: string;
  printKey: string;
  fr?: DbscardsIndexEntry;
  en?: DbscardsIndexEntry;
};

function pickBetter(
  prev: DbscardsIndexEntry | undefined,
  next: DbscardsIndexEntry,
): DbscardsIndexEntry {
  if (!prev) return next;
  return scoreTokenEntry(next) > scoreTokenEntry(prev) ? next : prev;
}

/**
 * Une fiche Bandai-shaped par numéro TK, titres FR+EN, faces dbscards.
 */
export function tokenCardsFromDbscardsEntries(
  fr: readonly DbscardsIndexEntry[],
  en: readonly DbscardsIndexEntry[],
): DbsParsedCard[] {
  const buckets = new Map<string, TokenBucket>();

  const ingest = (entry: DbscardsIndexEntry, lang: "fr" | "en") => {
    const printed = normalizeDbscardsTkRef(entry.ref);
    if (!printed) return;
    const printKey = dbsPrintKey(printed);
    if (!printKey) return;
    const prev = buckets.get(printKey) ?? { printed, printKey };
    if (lang === "fr") prev.fr = pickBetter(prev.fr, entry);
    else prev.en = pickBetter(prev.en, entry);
    buckets.set(printKey, prev);
  };

  for (const entry of fr) ingest(entry, "fr");
  for (const entry of en) ingest(entry, "en");

  const out: DbsParsedCard[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) =>
    a.printed.localeCompare(b.printed, "en"),
  )) {
    const parsed = parseDbsCollectorNumber(bucket.printed);
    if (!parsed) continue;
    const fr = bucket.fr;
    const en = bucket.en;
    const source =
      fr ??
      en ??
      null;
    if (!source) continue;
    const sourceUrl = `${DBSCARDS_ORIGIN}/cards/${source.slug}`;

    if (fr) {
      out.push({
        cardNumber: bucket.printed,
        setCode: parsed.set,
        number: parsed.number,
        grouping: parsed.grouping,
        printKey: bucket.printKey,
        lang: "fr",
        name: fr.name,
        awakenedName: null,
        setName: "Jetons",
        rarity: "Token",
        cardType: "JETON",
        color: null,
        character: null,
        power: null,
        imageUrl: fr.imageFront,
        backImageUrl: fr.imageBack,
        sourceUrl,
      });
    }
    if (en) {
      out.push({
        cardNumber: bucket.printed,
        setCode: parsed.set,
        number: parsed.number,
        grouping: parsed.grouping,
        printKey: bucket.printKey,
        lang: "en",
        name: en.name,
        awakenedName: null,
        setName: "Tokens",
        rarity: "Token",
        cardType: "TOKEN",
        color: null,
        character: null,
        power: null,
        imageUrl: en.imageFront,
        backImageUrl: en.imageBack,
        sourceUrl: `${DBSCARDS_ORIGIN}/cards/${en.slug}`,
      });
    }
  }
  return out;
}

/** Charge les index locaux et renvoie les jetons à fusionner. */
export function loadDbscardsTokenCards(
  packId = DBS_CG_PACK_ID,
): DbsParsedCard[] {
  void packId;
  return tokenCardsFromDbscardsEntries(
    loadDbscardsIndex("fr"),
    loadDbscardsIndex("en"),
  );
}

/** Chemins utiles aux tests / diagnostics. */
export function dbscardsTokenIndexPaths(packId = DBS_CG_PACK_ID): {
  fr: string;
  en: string;
  packDir: string;
} {
  return {
    fr: dbscardsIndexPath(packId, "fr"),
    en: dbscardsIndexPath(packId, "en"),
    packDir: foilPackDataDir(packId),
  };
}

export const DBS_CG_TOKEN_GAME = DBS_CG_GAME;
