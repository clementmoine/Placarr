/**
 * Magic printKey — set code + collector number as printed / Scryfall.
 *
 * Finish (foil / etched) stays off the key — property of the owned copy.
 */
import { buildPrintKey, type PrintIdentity } from "@/core/identify/printKey";

import { MTG_PRINT_GAME } from "./pack";

/**
 * Collector numbers may carry ★ / † / spaces. Segments must be `[a-z0-9.]`.
 * ★ → `s`, † → `t`; other non-alnum dropped.
 */
export function sanitizeMtgCollector(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/★/g, "s")
    .replace(/†/g, "t")
    .replace(/[^a-z0-9.]+/g, "");
}

export function sanitizeMtgSetCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9.]+/g, "");
}

export function mtgPrintIdentity(
  setCode: string | null | undefined,
  collectorNumber: string | null | undefined,
): PrintIdentity | null {
  const set = sanitizeMtgSetCode(setCode ?? "");
  const number = sanitizeMtgCollector(collectorNumber ?? "");
  if (!set || !number) return null;
  return { game: MTG_PRINT_GAME, set, number };
}

export function mtgPrintKey(
  setCode: string | null | undefined,
  collectorNumber: string | null | undefined,
): string | null {
  const identity = mtgPrintIdentity(setCode, collectorNumber);
  return identity ? buildPrintKey(identity) : null;
}

export function formatMtgReference(
  setCode: string,
  number: string,
  _grouping?: string | null,
): string {
  const set = setCode.trim().toUpperCase();
  const num = number.trim();
  return set && num ? `${set} · ${num}` : set || num;
}
