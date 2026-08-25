/**
 * Lire la base du CCG classique servie par narutocardgame.gg.
 *
 * Une seule page tient les 4 452 cartes, chacune liée à
 * `/archive/classic-ccg/{set}/{prefixe}{numero}-{slug}`. **Le set est dans
 * l'URL** : pas besoin d'ouvrir les fiches une à une, ce qui évite quatre mille
 * requêtes pour une information déjà servie.
 *
 * Mesuré le 2026-08-21 : 140 cartes qu'ils ont et que nous n'avons pas, dont
 * deux familles de préfixes qu'on ne connaît nulle part — `nc` (16) et `ex` (2).
 *
 * Attention à l'URL : `/cards` à la racine sert douze cartes d'échantillon du
 * **nouveau** jeu Bandai de 2027. Ce n'est pas cette base, et les confondre m'a
 * fait conclure à tort que le site n'avait rien.
 */

export type GgCard = {
  /** `n`, `j`, `m`, `c`, `nus`, `pr`… tel que l'URL le porte. */
  prefix: string;
  number: number;
  /** Le slug du set dans l'URL : `the-path-to-hokage`. */
  set: string;
  /** Le slug du nom : `naruto-uzumaki`. */
  slug: string;
};

const CARD_HREF =
  /href="\/archive\/classic-ccg\/([a-z0-9-]+)\/([a-z]+)(\d+)-([a-z0-9-]+)"/g;

/**
 * Extrait les cartes de la page d'index.
 *
 * Les doublons sont écartés : la page lie deux fois certaines cartes, une fois
 * dans la grille et une fois ailleurs, et compter deux fois fausserait toute
 * comparaison avec notre catalogue.
 */
export function parseGgCardIndex(html: string): GgCard[] {
  const seen = new Set<string>();
  const cards: GgCard[] = [];
  for (const match of html.matchAll(CARD_HREF)) {
    const [, set, prefix, number, slug] = match;
    const key = `${prefix}${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ prefix, number: Number(number), set, slug });
  }
  return cards;
}

/** `the-path-to-hokage` → `The Path To Hokage`. */
export function ggSetLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** `naruto-uzumaki` → `Naruto Uzumaki`. Le nom n'est que dans le slug. */
export function ggCardName(slug: string): string {
  return ggSetLabel(slug);
}

/**
 * Ce que cette base ajoute au nôtre, sur le couple (préfixe, numéro).
 *
 * Rendre l'écart plutôt qu'une fusion : un préfixe inconnu est une famille dont
 * on ignore la règle de numérotation, et le verser sans l'avoir identifié
 * reviendrait à inventer des cartes.
 */
export function ggCardsMissingFrom(
  cards: readonly GgCard[],
  held: ReadonlySet<string>,
): GgCard[] {
  return cards.filter((card) => !held.has(`${card.prefix}${card.number}`));
}
