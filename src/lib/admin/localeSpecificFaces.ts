/**
 * Per-pack ledger of prints whose **recto** carries locale-specific printed text.
 *
 * Lives next to `cards-index.json` as `locale-specific-faces.json`. Any catalogue
 * pack can opt in via `CataloguePackInfo.localeArt`; nothing here is TCG-specific.
 */
import { existsSync, readFileSync, statSync } from "node:fs";

import { packLocaleSpecificFacesPath } from "@/lib/packPaths";

export type LocaleSpecificFacesV1 = {
  version: 1;
  /** Human note — ignored at runtime. */
  note?: string;
  faces: readonly { set: string; card: string }[];
};

const cache = new Map<string, { mtimeMs: number; keys: Set<string> }>();

export function localeSpecificFaceKey(set: string, card: string): string {
  const normalized = card.trim().padStart(4, "0");
  return `${set.trim().toLowerCase()}\0${normalized}`;
}

function isLocaleSpecificFacesV1(raw: unknown): raw is LocaleSpecificFacesV1 {
  if (!raw || typeof raw !== "object") return false;
  const faces = (raw as LocaleSpecificFacesV1).faces;
  if (!Array.isArray(faces)) return false;
  return faces.every(
    (row) =>
      row &&
      typeof row === "object" &&
      typeof row.set === "string" &&
      typeof row.card === "string",
  );
}

/** `null` when the pack has no ledger — every print is treated as language-neutral. */
export function loadLocaleSpecificFaces(pack: string): Set<string> | null {
  const dest = packLocaleSpecificFacesPath(pack);
  if (!existsSync(dest)) return null;
  const mtimeMs = statSync(dest).mtimeMs;
  const hit = cache.get(pack);
  if (hit && hit.mtimeMs === mtimeMs) return hit.keys;

  const raw = JSON.parse(readFileSync(dest, "utf8")) as unknown;
  if (!isLocaleSpecificFacesV1(raw)) {
    throw new Error(`locale-specific-faces invalide : ${dest}`);
  }
  const keys = new Set(
    raw.faces.map((row) => localeSpecificFaceKey(row.set, row.card)),
  );
  cache.set(pack, { mtimeMs, keys });
  return keys;
}

export function resetLocaleSpecificFacesCache(): void {
  cache.clear();
}

export function isLocaleSpecificFace(
  ledger: Set<string> | null,
  set: string,
  card: string,
): boolean {
  if (!ledger) return false;
  return ledger.has(localeSpecificFaceKey(set, card));
}
