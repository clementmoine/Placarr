/**
 * Ledger des noms FR dbzcollection (champ « Nom » des fiches AJAX).
 * Certaines cartes n'ont pas de Nom (ex. Part 2 D-127) — absentes du ledger.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchDbzcText } from "@/providers/dragonball/shared/dbzcollection/site";
import { packStagingDir } from "@/lib/packPaths";

import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import {
  dbzcCardInfoUrl,
  dbzcSetListingUrl,
  parseDbzcCardDetail,
  parseDbzcollectionListing,
} from "../parse/dbzcollection";
import { parseDbsjccNumber } from "../printKey";

export type DbzcollectionNameRow = {
  setCode: string;
  printed: string;
  number: string;
  cardId: string;
  name: string;
  rarity: string | null;
};

type DbzcLedger = {
  sets?: Array<{ ids: string; setCode: string; label?: string }>;
};

const LEDGER_SETS = path.join(dbsJccCuratedDir(), "sources", "dbzcollection.json");

export function dbsJccDbzcollectionNamesLedgerPath(): string {
  return path.join(dbsJccCuratedDir(), "sources", "dbzcollection-names.json");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadSets(): Array<{ ids: string; setCode: string }> {
  if (!existsSync(LEDGER_SETS)) return [];
  const doc = JSON.parse(readFileSync(LEDGER_SETS, "utf8")) as DbzcLedger;
  return (doc.sets ?? [])
    .map((row) => ({
      ids: String(row.ids ?? "").trim(),
      setCode: String(row.setCode ?? "").trim().toLowerCase(),
    }))
    .filter((row) => row.ids && row.setCode);
}

export async function harvestDbzcollectionNames(opts?: {
  setCodes?: readonly string[];
  delayMs?: number;
  /** Resume: skip cardIds already in an existing ledger. */
  resume?: boolean;
}): Promise<{ named: number; missingNom: number; path: string }> {
  const outPath = dbsJccDbzcollectionNamesLedgerPath();
  mkdirSync(path.dirname(outPath), { recursive: true });
  const delayMs = opts?.delayMs ?? 120;
  const want = opts?.setCodes
    ? new Set(opts.setCodes.map((c) => c.trim().toLowerCase()))
    : null;

  const prevByCardId = new Map<string, DbzcollectionNameRow>();
  if (opts?.resume !== false && existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, "utf8")) as {
        names?: DbzcollectionNameRow[];
      };
      for (const row of prev.names ?? []) {
        if (row.cardId) prevByCardId.set(row.cardId, row);
      }
    } catch {
      /* start fresh */
    }
  }

  const rows: DbzcollectionNameRow[] = [...prevByCardId.values()];
  let missingNom = 0;

  for (const set of loadSets()) {
    if (want && !want.has(set.setCode)) continue;
    const listingUrl = dbzcSetListingUrl(set.ids);
    const html = await fetchDbzcText(listingUrl, { minLength: 400 });
    if (!html) continue;
    // Keep a staging copy for resume / offline re-parse.
    const listingDest = path.join(
      packStagingDir(DBS_JCC_PACK_ID),
      "dbzcollection-names",
      `listing_${set.setCode}.html`,
    );
    mkdirSync(path.dirname(listingDest), { recursive: true });
    writeFileSync(listingDest, html, "utf8");
    const { cards } = parseDbzcollectionListing(html);
    for (const card of cards) {
      if (prevByCardId.has(card.cardId)) continue;
      const detailHtml = await fetchDbzcText(dbzcCardInfoUrl(card.cardId), {
        minLength: 50,
      });
      if (delayMs > 0) await sleep(delayMs);
      if (!detailHtml) {
        missingNom += 1;
        continue;
      }
      const detail = parseDbzcCardDetail(detailHtml, card.cardId);
      const name = detail.name?.trim() || "";
      if (!name) {
        missingNom += 1;
        continue;
      }
      const number =
        parseDbsjccNumber(detail.printed ?? card.printed) ??
        parseDbsjccNumber(card.printed);
      if (!number) continue;
      const printed =
        (detail.printed ?? card.printed).trim().toUpperCase() ||
        card.printed;
      const row: DbzcollectionNameRow = {
        setCode: set.setCode,
        printed,
        number,
        cardId: card.cardId,
        name,
        rarity: detail.rarity?.trim() || card.rarityTile || null,
      };
      rows.push(row);
      prevByCardId.set(card.cardId, row);
    }
    // Persist incrementally so a long crawl survives interruption.
    writeNamesLedger(outPath, rows, missingNom);
  }

  writeNamesLedger(outPath, rows, missingNom);
  return { named: rows.length, missingNom, path: outPath };
}

function writeNamesLedger(
  outPath: string,
  rows: DbzcollectionNameRow[],
  missingNom: number,
): void {
  const sorted = [...rows].sort(
    (a, b) =>
      a.setCode.localeCompare(b.setCode) ||
      a.number.localeCompare(b.number, "en", { numeric: true }),
  );
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        source: "dbzcollection.fr card detail Nom",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        url: "http://www.dbzcollection.fr/2v2/",
        note: "Only cards whose AJAX detail exposes a Nom field. Missing Nom ≠ unknown card.",
        missingNomSampleHint:
          "Part 2 D-127 has no Nom on dbzcollection — use carddass.fr / Part 1 same number.",
        missingNom,
        names: sorted,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
