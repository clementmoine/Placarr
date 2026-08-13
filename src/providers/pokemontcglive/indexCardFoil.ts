/**
 * Build the `card_foil` table from the Live dump's `cards.json`.
 *
 * ``pnpm foil:pokemon:index-card-foil`` (also chained from ``foil:pokemon``).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { dataRoot } from "@/lib/runtimeData";

type RawVariant = {
  cardTex?: string;
  maskTex?: string;
  etchTex?: string;
  coldFoilTex?: string;
  foil?: string;
  shader?: string;
};

const VARIANTS = ["std", "ph"] as const;

function sourcePath(): string {
  const override = process.env.PLACARR_CARDS_JSON?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), "pokemon", "cards.json");
}

function dbPath(): string {
  const override = process.env.PLACARR_LIVE_CARDS_DB?.trim();
  if (override) return path.resolve(override);
  return path.join(dataRoot(), "pokemon", "catalog.sqlite");
}

export function buildCardFoilIndex(opts?: {
  cardsJson?: string;
  db?: string;
}): { rows: number; bundles: number; path: string } {
  const src = opts?.cardsJson ?? sourcePath();
  if (!existsSync(src)) {
    throw new Error(
      `No dump at ${src}\n` +
        `Set PLACARR_CARDS_JSON, or run the Live card dump first.`,
    );
  }

  const raw = JSON.parse(readFileSync(src, "utf8")) as Record<
    string,
    Record<string, RawVariant>
  >;

  const target = opts?.db ?? dbPath();
  const db = new DatabaseSync(target);
  db.exec("PRAGMA busy_timeout = 30000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS card_foil (
      bundle_id     TEXT NOT NULL,
      variant       TEXT NOT NULL,
      card_tex      TEXT NOT NULL DEFAULT '',
      mask_tex      TEXT NOT NULL DEFAULT '',
      etch_tex      TEXT NOT NULL DEFAULT '',
      cold_foil_tex TEXT NOT NULL DEFAULT '',
      foil          TEXT NOT NULL DEFAULT '',
      shader        TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (bundle_id, variant)
    );
    CREATE INDEX IF NOT EXISTS card_foil_shader ON card_foil (shader);
  `);

  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec("DELETE FROM card_foil");

    const insert = db.prepare(
      `INSERT OR REPLACE INTO card_foil
         (bundle_id, variant, card_tex, mask_tex, etch_tex, cold_foil_tex, foil, shader)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let bundles = 0;
    let rows = 0;
    for (const [bundleId, entry] of Object.entries(raw)) {
      if (!entry || typeof entry !== "object") continue;
      bundles += 1;
      for (const variant of VARIANTS) {
        const v = entry[variant];
        if (!v) continue;
        insert.run(
          bundleId,
          variant,
          v.cardTex?.trim() ?? "",
          v.maskTex?.trim() ?? "",
          v.etchTex?.trim() ?? "",
          v.coldFoilTex?.trim() ?? "",
          v.foil?.trim() ?? "",
          v.shader?.trim() ?? "",
        );
        rows += 1;
      }
    }

    db.exec("COMMIT");
    return { rows, bundles, path: target };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* no txn */
    }
    throw err;
  } finally {
    db.close();
  }
}

function main(): void {
  try {
    const meta = buildCardFoilIndex();
    console.log(
      `card_foil: ${meta.rows} rows from ${meta.bundles} bundles → ${meta.path}`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

const entry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entry) {
  main();
}
