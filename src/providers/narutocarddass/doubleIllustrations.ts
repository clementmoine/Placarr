/**
 * Tirages JP publiés sous deux illustrations (GIF double de la cardlist
 * officielle carddas.com) — preuves et contexte dans
 * `curated/sources/carddas-jp-double-illustrations.json`.
 *
 * Même numéro imprimé, même texte, même rareté : une seule identité. La ligne
 * de `core/enrich/variants` s'applique — l'illustration est une propriété de
 * la copie (`Item.variant`), jamais un second tirage.
 */
import ledger from "./curated/sources/carddas-jp-double-illustrations.json";

export const NARUTO_ILLUSTRATION_B_LABEL = "illustration B";

/** `normal` → `normal (illustration B)` — l'option du sélecteur de variante. */
export function narutoIllustrationBFinish(finish: string): string {
  return `${finish} (${NARUTO_ILLUSTRATION_B_LABEL})`;
}

type DoubleIllustrationCard = {
  number: string;
  artB: string;
};

const ART_B_BY_NUMBER = new Map<string, string>(
  (ledger.cards as DoubleIllustrationCard[]).map((card) => [
    card.number.trim().toLowerCase(),
    card.artB,
  ]),
);

/**
 * Fichier de l'illustration B pour un numéro de disque (`te0358`),
 * `null` pour tout autre tirage. L'illustration A reste la face affichée.
 */
export function narutoIllustrationBArt(number: string): string | null {
  return ART_B_BY_NUMBER.get(number.trim().toLowerCase()) ?? null;
}
