/**
 * Pokémon on-disk DB paths — identity vs TCG Live foil/join store.
 *
 * `catalog.sqlite` = identity SSOT (TCGdex prints / titles), same contract as
 * other TCG packs. `live.sqlite` = Live client dump (`live_cards`, `card_foil`).
 *
 * Older layouts had Live on `catalog.sqlite` and identity on `prints.sqlite`;
 * {@link ensurePokemonDbLayout} renames once when those leftovers are found.
 */
import { existsSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";

export const POKEMON_PACK_ID = "pokemon";

export function pokemonLiveDbPath(): string {
  const override = process.env.PLACARR_LIVE_CARDS_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), POKEMON_PACK_ID, "live.sqlite");
}

/** Identity corpus (TCGdex) — pack contract name. */
export function pokemonIdentityDbPath(): string {
  return path.join(dataRoot(), POKEMON_PACK_ID, "catalog.sqlite");
}

/** Pre-rename identity file — migrate into {@link pokemonIdentityDbPath}. */
export function pokemonLegacyPrintsDbPath(): string {
  return path.join(dataRoot(), POKEMON_PACK_ID, "prints.sqlite");
}

function tableExists(dbPath: string, table: string): boolean {
  if (!existsSync(dbPath)) return false;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
        )
        .get(table) as { ok: number } | undefined;
      return Boolean(row);
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * One-shot layout fix so identity owns `catalog.sqlite` and Live owns
 * `live.sqlite`. Safe to call on every open (no-op when already migrated).
 */
export function ensurePokemonDbLayout(): void {
  const identity = pokemonIdentityDbPath();
  const live = pokemonLiveDbPath();
  const legacyPrints = pokemonLegacyPrintsDbPath();

  // Live dump still sitting on the identity filename → move aside.
  if (
    existsSync(identity) &&
    tableExists(identity, "live_cards") &&
    !tableExists(identity, "prints")
  ) {
    if (!existsSync(live)) {
      renameSync(identity, live);
    } else {
      // Stale Live dump blocking the identity name — remove after live.sqlite exists.
      try {
        unlinkSync(identity);
      } catch {
        /* ignore */
      }
    }
  }

  // Pre-contract identity file → catalog.sqlite.
  if (existsSync(legacyPrints)) {
    if (!existsSync(identity)) {
      renameSync(legacyPrints, identity);
    } else if (tableExists(identity, "prints")) {
      // Duplicate leftover after a prior migrate.
      try {
        unlinkSync(legacyPrints);
      } catch {
        /* ignore */
      }
    }
  }
}
