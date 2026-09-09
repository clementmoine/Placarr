/**
 * Les langues qu'un catalogue de cartes peut réellement servir.
 *
 * **Lues dans la base, jamais écrites à la main.** Une liste en dur ment dès
 * qu'une moisson ajoute une langue ou qu'un pack en perd une, et le mensonge
 * est silencieux : un filtre qui masque un catalogue capable de répondre ne
 * produit aucune erreur, juste une absence.
 *
 * C'est ce qui permet au filtre de langue de retirer les jeux qui ne sont pas
 * sortis dans cette langue — Fusion World n'existe qu'en anglais et en
 * japonais, et n'a rien à faire sous « français ».
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** Mémorisé par chemin : la question est posée à chaque ouverture de modale. */
const cache = new Map<string, string[]>();

export function resetPrintLanguagesCache(): void {
  cache.clear();
}

export function distinctPrintLanguages(dbPath: string): string[] {
  const held = cache.get(dbPath);
  if (held) return held;
  if (!existsSync(dbPath)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT DISTINCT lang FROM print_titles
          WHERE lang IS NOT NULL AND TRIM(lang) <> ''`,
      )
      .all() as { lang: string }[];
    const langs = [
      ...new Set(rows.map((row) => row.lang?.trim().toLowerCase())),
    ].sort();
    cache.set(dbPath, langs);
    return langs;
  } catch {
    /*
      Une base absente ou d'une autre forme ne doit pas masquer son catalogue :
      rendre la liste vide veut dire « on ne sait pas », et le filtre ne cache
      que ce qu'il sait.
    */
    return [];
  } finally {
    db?.close();
  }
}
