/**
 * Promo checklist = dedicated `PR-…` / `OP忍` **or** the FR tournament
 * reprints Collection Naruto enumerated (YT 7r7 shuriken / CdF lists).
 *
 * Inserts S6 manga/DVD share retail numbers (`NI-232`) — they are not promo
 * reprints and must not mint `ni0232-promo` twins.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseNarutoCollector,
  type NarutoCollectorId,
} from "../collectorIdentity";
import { narutoCuratedSourcesDir } from "../curatedPaths";

type DigFile = {
  promos?: {
    lists?: {
      "1"?: readonly string[];
      "2"?: readonly string[];
      "3"?: readonly string[];
    };
  };
};

let cached: Set<string> | null = null;

/** Dig form: `ni023`, `te001`, `ta067`. */
export function digCollectorForm(raw: string): string | null {
  const id = parseNarutoCollector(raw);
  if (!id) return null;
  if (id.family === "promo") return null;
  const prefix =
    id.family === "ninja"
      ? "ni"
      : id.family === "jutsu"
        ? "te"
        : id.family === "mission"
          ? "ta"
          : id.printedPrefix.toLowerCase();
  if (prefix !== "ni" && prefix !== "te" && prefix !== "ta") return null;
  return `${prefix}${String(id.number).padStart(3, "0")}`;
}

function loadDigTournamentNumbers(): Set<string> {
  if (cached) return cached;
  const filePath = path.join(
    narutoCuratedSourcesDir(),
    "collection-naruto-youtube-2026-08-29.json",
  );
  try {
    const dig = JSON.parse(readFileSync(filePath, "utf8")) as DigFile;
    const lists = dig.promos?.lists;
    cached = new Set(
      [...(lists?.["1"] ?? []), ...(lists?.["2"] ?? []), ...(lists?.["3"] ?? [])]
        .map((entry) => digCollectorForm(entry) ?? entry.trim().toLowerCase())
        .filter(Boolean),
    );
  } catch {
    cached = new Set();
  }
  return cached;
}

/** Reset between tests that stub the dig file. */
export function resetConfirmedCarddassTournamentPromosCache(): void {
  cached = null;
}

function isTourneyReprint(id: NarutoCollectorId): boolean {
  const grouping = id.grouping?.toLowerCase();
  return grouping === "promo" || grouping === "cdf";
}

/**
 * Whether a print belongs on the Promo (hors série) checklist.
 * `PR-011` yes; `NI-023 · promo` if in 7r7 lists; `NI-232 · promo` no.
 */
export function belongsOnNarutoPromoChecklist(raw: string): boolean {
  const id = parseNarutoCollector(raw);
  if (!id) return false;
  if (id.family === "promo") return true;
  if (id.grouping?.toLowerCase() === "ps") return true;
  if (!isTourneyReprint(id)) return false;
  const form = digCollectorForm(raw);
  if (!form) return false;
  return loadDigTournamentNumbers().has(form);
}
