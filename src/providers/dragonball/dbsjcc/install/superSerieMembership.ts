/**
 * Super Série ss1–ss6 = reprints of existing D-### prints (home `partN`).
 * DCM checklist → `print_sets` membership so the card checklist is measurable.
 */
import { existsSync, readFileSync } from "node:fs";

import type {
  LocalPrintsIndex,
  LocalPrintWrite,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import type { DbsjccPrintCandidate } from "../harvest/chitoroshop";
import { matchChitoroshopToDbsjccPrint } from "../harvest/chitoroshop";
import {
  dbsJccDeckcardmaniaLedgerPath,
  readDeckcardmaniaLedger,
  type DeckcardmaniaLedger,
} from "../harvest/deckcardmania";
import { parseDbsjccNumber, splitDbsjccNumber } from "../printKey";

function loadLedger(ledgerPath?: string): DeckcardmaniaLedger | null {
  if (ledgerPath) {
    if (!existsSync(ledgerPath)) return null;
    try {
      return JSON.parse(readFileSync(ledgerPath, "utf8")) as DeckcardmaniaLedger;
    } catch {
      return null;
    }
  }
  return readDeckcardmaniaLedger();
}

function candidatesForNumber(
  index: LocalPrintsIndex,
  number: string,
): DbsjccPrintCandidate[] {
  const want = splitDbsjccNumber(number)?.base;
  const letter = splitDbsjccNumber(number)?.artLetter;
  const rows = index
    .searchRows(number, { language: "fr", limit: 80 })
    .filter((row) => {
      const split = splitDbsjccNumber(row.number);
      if (!want || !split) return row.number === number;
      if (split.base !== want) return false;
      if (letter) return split.artLetter === letter;
      return true;
    });
  const byKey = new Map<string, DbsjccPrintCandidate>();
  for (const row of rows) {
    if (byKey.has(row.printKey)) continue;
    byKey.set(row.printKey, {
      printKey: row.printKey,
      setCode: row.setCode,
      number: row.number,
      grouping: row.grouping ?? null,
    });
  }
  return [...byKey.values()];
}

export type InstallSuperSerieMembershipReport = {
  albums: number;
  listed: number;
  linked: number;
  missing: number;
  missingPrinted: string[];
};

/**
 * Attach ssN membership on existing FR prints listed in DCM Super Série
 * checklists (+ holos as fallback when checklist empty).
 */
export function installDbsJccSuperSerieMembership(
  index: LocalPrintsIndex,
  opts: { ledgerPath?: string } = {},
): InstallSuperSerieMembershipReport {
  const ledger = loadLedger(opts.ledgerPath);
  if (!ledger) {
    return { albums: 0, listed: 0, linked: 0, missing: 0, missingPrinted: [] };
  }

  const rows: LocalPrintWrite[] = [];
  const seenLink = new Set<string>();
  const missingPrinted: string[] = [];
  let albums = 0;
  let listed = 0;
  let linked = 0;
  let missing = 0;

  for (const album of ledger.albums) {
    const set = album.setHint?.trim().toLowerCase() ?? "";
    if (!/^ss\d+$/.test(set) || album.line !== "super-serie") continue;
    albums += 1;
    const checklist = album.checklist ?? [];
    const pool = checklist.length
      ? checklist
      : [...(album.holos ?? []), ...(album.rares ?? [])];
    for (const printed of pool) {
      listed += 1;
      const number = parseDbsjccNumber(printed);
      if (!number) {
        missing += 1;
        if (missingPrinted.length < 40) missingPrinted.push(printed);
        continue;
      }
      const candidates = candidatesForNumber(index, number);
      // Resolve against partN/sp/promo — not ssN (no home prints there).
      const decision = matchChitoroshopToDbsjccPrint(number, null, candidates);
      if (decision.kind !== "match") {
        missing += 1;
        if (missingPrinted.length < 40) missingPrinted.push(printed);
        continue;
      }
      const print = decision.print;
      const linkKey = `${print.printKey}|${set}`;
      if (seenLink.has(linkKey)) continue;
      seenLink.add(linkKey);
      const row = index.lookupRow(print.printKey, { language: "fr" });
      if (!row) {
        missing += 1;
        if (missingPrinted.length < 40) missingPrinted.push(printed);
        continue;
      }
      rows.push({
        printKey: row.printKey,
        setCode: row.setCode,
        number: row.number,
        cardType: row.cardType || "card",
        grouping: row.grouping ?? null,
        setCodes: [row.setCode, set],
        titles: [],
      });
      linked += 1;
    }
  }

  if (rows.length) index.writePrints(rows);
  return { albums, listed, linked, missing, missingPrinted };
}
