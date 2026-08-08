/**
 * Build the `card_foil` table from the Live dump's `cards.json`.
 *
 * ``pnpm foil:pokemon:index-card-foil``
 *
 * The dump used to live at `src/effects/pokemon/cards.json` and be imported
 * statically. At 10.7 MB and 41 546 entries that put the whole thing into the
 * *browser* bundle — two `"use client"` components reach the pack — and webpack
 * never finished: the dev server listened and compiled nothing, at 0 % CPU,
 * with no `Compiling` line ever logged. It also cost `tsserver` ~1.6 GB, since
 * `resolveJsonModule` infers a literal type over every entry.
 *
 * A row is only ever read one at a time, by bundle id or by shader. That is a
 * table, not a module.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
  return path.join(dataRoot(), "pokemon", "live-cards.sqlite");
}

function main(): void {
  const src = sourcePath();
  if (!existsSync(src)) {
    console.error(
      `No dump at ${src}\n` +
        `Set PLACARR_CARDS_JSON, or run the Live card dump first.`,
    );
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(readFileSync(src, "utf8")) as Record<
    string,
    Record<string, RawVariant>
  >;

  const target = dbPath();
  const db = new DatabaseSync(target);

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
    -- The playroom asks "which prints wear this shader?" once per material;
    -- without this it is a 41k-row scan every time.
    CREATE INDEX IF NOT EXISTS card_foil_shader ON card_foil (shader);
  `);

  db.exec("DELETE FROM card_foil");
  db.exec("BEGIN");

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
  db.close();

  console.log(
    `card_foil: ${rows} rows from ${bundles} bundles → ${target}`,
  );
}

main();
