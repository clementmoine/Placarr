/**
 * Récolte d'une cardlist nikita → ledger JSON curated.
 *
 * Fetch + parse HTML sont dans `cardlist.ts` ; ici seulement l'écriture du
 * fichier (même enveloppe pour chaque jeu). Le mapping ref → printKey reste
 * chez le provider via `parse`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  fetchNikitaCardlistHtml,
  NIKITA_TCG_DB_ORIGIN,
  nikitaCardlistPath,
} from "./cardlist";

export async function harvestNikitaCardlist<T>(input: {
  game: string;
  parse: (html: string) => T[];
  outPath: string;
  extra?: Record<string, unknown>;
  serializeCards?: (cards: T[]) => unknown;
}): Promise<{ cards: T[]; outPath: string }> {
  const html = await fetchNikitaCardlistHtml(input.game);
  const cards = input.parse(html);
  mkdirSync(path.dirname(input.outPath), { recursive: true });
  writeFileSync(
    input.outPath,
    `${JSON.stringify(
      {
        source: `tcg-db.nikita.jp/cardlist/${input.game}`,
        lang: "ja",
        observed: new Date().toISOString().slice(0, 10),
        url: `${NIKITA_TCG_DB_ORIGIN}${nikitaCardlistPath(input.game)}`,
        count: cards.length,
        ...input.extra,
        cards: input.serializeCards?.(cards) ?? cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards, outPath: input.outPath };
}
