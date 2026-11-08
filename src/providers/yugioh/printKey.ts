/**
 * Yu-Gi-Oh! print identity from ScanFlip / set codes (`LDD-F000`).
 */
import { buildPrintKey } from "@/core/identify/printKey";

import { YUGIOH_PRINT_GAME } from "./pack";

export type YugiohParsedCode = {
  set: string;
  number: string;
  printed: string;
};

/** `LDD-F000` / `TP1-F001` / `ABPF-FRSE1` / `LOB-EN000` → set + collector segment. */
export function parseYugiohPrintedCode(raw: string): YugiohParsedCode | null {
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, "");
  const m = trimmed.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
  if (!m) return null;
  return {
    set: m[1]!.toLowerCase(),
    number: m[2]!.toLowerCase(),
    printed: `${m[1]}-${m[2]}`,
  };
}

export function yugiohPrintKey(set: string, number: string): string | null {
  return buildPrintKey({
    game: YUGIOH_PRINT_GAME,
    set: set.trim().toLowerCase(),
    number: number.trim().toLowerCase(),
  });
}

export function formatYugiohReference(set: string, number: string): string {
  return `${set.trim().toUpperCase()}-${number.trim().toUpperCase()}`;
}

/**
 * True when the collector segment is a French regional printing
 * (`fr001`, `frp01`, `frse1`, `f000`…), not an EN/PT code with a FR *name*.
 */
export function isYugiohFrRegionalNumber(number: string): boolean {
  const n = number.trim().toLowerCase();
  return /^fr/.test(n) || /^f\d/.test(n);
}

export function normalizeYugiohSearchQuery(query: string): string {
  const parsed = parseYugiohPrintedCode(query);
  if (parsed) return parsed.number;
  return query.trim().toLowerCase();
}
