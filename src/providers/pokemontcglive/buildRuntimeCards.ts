/**
 * Keyed runtime `data/pokemon/cards.json` from MaterialManifest rows (ADR-021).
 * Mirrors ``build_keyed_cards`` / ``write_runtime_cards`` in ``extract.py``.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  foilManifestToShader,
  invalidatePokemonFoilNamesCache,
} from "@/effects/pokemon/foilNames";
import { foilPackDir, packDataDir } from "@/providers/shared/foilPaths";

import type { MaterialManifestRow } from "@/providers/pokemontcglive/extractCardTextures";

export type KeyedCardVariant = {
  foil: string;
  shader: string;
  cardTex: string;
  maskTex: string;
  etchTex?: string;
  coldFoilTex?: string;
};

export type KeyedCards = Record<string, Record<"std" | "ph", KeyedCardVariant>>;

export function buildKeyedCards(rows: MaterialManifestRow[]): KeyedCards {
  const out: KeyedCards = {};
  for (const row of rows) {
    const bid = (row.bundle || "").trim();
    const variant = row.variant;
    if (!bid || (variant !== "std" && variant !== "ph")) continue;

    const entry: KeyedCardVariant = {
      foil: row.foil,
      shader: foilManifestToShader(row.foil) ?? "",
      cardTex: row.cardTex,
      maskTex: row.maskTex,
    };
    const etch = (row.etch || "").trim();
    const cold = (row.coldFoil || "").trim();
    if (etch) entry.etchTex = etch;
    if (cold) entry.coldFoilTex = cold;
    out[bid] ??= {} as Record<"std" | "ph", KeyedCardVariant>;
    out[bid]![variant] = entry;
  }
  return out;
}

export function writeRuntimeCards(
  repo: string,
  rows: MaterialManifestRow[],
): string {
  invalidatePokemonFoilNamesCache();
  const dest = path.join(packDataDir(repo, "pokemon"), "cards.json");
  mkdirSync(path.dirname(dest), { recursive: true });
  const keyed = buildKeyedCards(rows);
  writeFileSync(dest, `${JSON.stringify(keyed, null, 2)}\n`, "utf8");
  return dest;
}

export function writeFoilManifestDump(
  repo: string,
  rows: MaterialManifestRow[],
): string {
  const dest = path.join(foilPackDir(repo, "pokemon"), "cards.json");
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify({ cards: rows, count: rows.length }, null, 2)}\n`,
    "utf8",
  );
  return dest;
}
