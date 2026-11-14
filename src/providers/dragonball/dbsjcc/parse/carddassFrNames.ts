/**
 * Noms FR officiels Bandai — pages fiche carddass.fr/dbz (`D-001.htm`…).
 * Archives Wayback uniquement (le site live est mort).
 */
import { decodeDbzcEntities } from "@/providers/dragonball/shared/dbzcollection/site";

import { parseDbsjccNumber } from "../printKey";

const NAME_RE =
  /textBorange[^>]*>\s*::\s*([\s\S]*?)\s*::\s*</i;

const PRINTED_FROM_PATH_RE = /\/cartes\/((?:D|SP)[-_]?\d+)\.htm$/i;

export function parseCarddassFrCardPageName(html: string): string | null {
  const m = NAME_RE.exec(html);
  if (!m) return null;
  // Decode twice: some Wayback captures keep nested entities (`v&amp;oelig;u`).
  const raw = decodeDbzcEntities(
    decodeDbzcEntities(m[1]!.replace(/<[^>]+>/g, " ")),
  );
  const name = raw.replace(/\s+/g, " ").trim();
  return name || null;
}

export function printedFromCarddassFrCardPath(
  originalUrl: string,
): { printed: string; number: string } | null {
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(originalUrl).pathname);
  } catch {
    return null;
  }
  const m = PRINTED_FROM_PATH_RE.exec(pathname);
  if (!m) return null;
  const number = parseDbsjccNumber(m[1]!);
  if (!number) return null;
  const prefix = number.startsWith("sp") ? "SP" : "D";
  const n = Number.parseInt(number.replace(/^[a-z]+/, ""), 10);
  return { printed: `${prefix}-${n}`, number };
}
