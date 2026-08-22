/**
 * Scans Coleka de Naruto: Ninja Ranks (Panini/Inkworks, 2006).
 *
 * Coleka écrit `Ref. 001` — le numéro imprimé du set de base, sans préfixe,
 * puisque cette ligne n'en a pas. Les visuels sont des photos de
 * collectionneur, pas des rendus éditeur : ~1057×1500, la même classe que la
 * Série 24.
 *
 * **Deux signaux, jamais un.** La référence dit le numéro, et le nom de fichier
 * de la vignette le répète (`…-carte-n-7-007_250x250.webp`). Une fiche dont le
 * fichier ne porte pas son numéro est écartée : sur la page 1 mesurée le
 * 2026-08-22, c'est le cas de la carte 3, dont la vignette générique
 * (`coleka-carte-panini-naruto`) pourrait être n'importe quoi. Un visuel
 * plausible mais faux coûte plus cher qu'un trou.
 *
 * **Seul le set de base est adressé.** Coleka annonce 102 fiches quand la ligne
 * compte 72 cartes de base et 28 inserts : sa séquence au-delà de 72 ne
 * correspond à rien de vérifié, et la deviner créerait des cartes fantômes.
 * Les inserts restent donc sans face jusqu'à ce qu'on sache lire leur numéro.
 */
export const COLEKA_NINJA_RANKS_ORIGIN = "https://www.coleka.com";
/** Branche EN : la FR déclenche le mur de vérification plus vite. */
export const COLEKA_NINJA_RANKS_LISTING_PATH =
  "/en/trading-cards/panini-cards/naruto-ninja-ranks_r25928";
/**
 * Langue sous laquelle la face est rangée.
 *
 * Ce champ n'est pas « la langue du tirage photographié » : `exportIndex`
 * apparie une face à un **titre** de la même langue
 * (`a.lang = t.lang`), et une face sans titre dans sa langue n'apparaît nulle
 * part. Les titres de ce pack viennent de la feuille Inkworks, en anglais —
 * les faces s'y rangent donc.
 *
 * Ce que Coleka photographie est bien le tirage **français** : la carte 68 s'y
 * intitule « Secon examen des survivants » là où Inkworks écrit « Second Exam
 * Survivors ». Sur les cartes de personnage, l'écart ne se voit pas — la 40 est
 * « ROCK LEE » en latin et en katakana, sans un mot de français. Seules les
 * cartes à texte traduisent. La provenance est notée au registre plutôt que
 * dans un champ que le modèle n'entend pas ainsi.
 */
export const COLEKA_NINJA_RANKS_LANG = "en";
/** Set de base : le seul dont la numérotation Coleka est attestée. */
export const COLEKA_NINJA_RANKS_SET = "nr";
/** Cartes du set de base — au-delà, Coleka ne dit plus rien de sûr. */
export const NINJA_RANKS_BASE_CARDS = 72;

/**
 * Slug de la collection, tel que Coleka nomme ses fichiers.
 *
 * Un vrai scan porte le titre de la carte (`…-carte-n-7-007`,
 * `…-secon-examen-des-survivants-068`). Le **substitut** que le site affiche
 * pour une carte non photographiée répète le slug de la collection
 * (`naruto-ninja-ranks-panini-naruto-ninja-ranks-6-006`) : c'est un gabarit,
 * un cadre blanc avec le numéro au centre. Les douze rencontrés le 2026-08-22
 * pèsent tous entre 26,2 et 26,7 Ko en 436×600 exactement — le même fichier à
 * un chiffre près. Les verser donnerait des faces qui ne montrent pas la carte.
 */
export const COLEKA_NINJA_RANKS_SLUG = "naruto-ninja-ranks";

/** Le nom de fichier répète-t-il le slug de la collection ? Alors c'est un gabarit. */
export function thumbIsPlaceholder(thumbUrl: string): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "").replace(/_\d+x\d+\.\w+$/, "");
  const parts = stem.split(COLEKA_NINJA_RANKS_SLUG);
  return parts.length > 2;
}

export type ColekaNinjaRanksCard = {
  /** Numéro à quatre chiffres, comme la clé de tirage : `0007`. */
  number: string;
  /** Référence telle que Coleka l'imprime : `7`. */
  colekaRef: number;
  name: string;
  thumbUrl: string;
  faceUrl: string;
};

export type ColekaNinjaRanksParse = {
  cards: ColekaNinjaRanksCard[];
  /** Fiches vues mais refusées, avec la raison — jamais un silence. */
  rejected: { ref: number; name: string; reason: string }[];
};

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Les vignettes sont `_250x250.webp` ; la pleine taille est le même chemin nu. */
export function colekaNinjaRanksFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i, "");
}

/** Le nom de fichier répète-t-il le numéro de la référence ? */
export function thumbCorroboratesRef(thumbUrl: string, ref: number): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "").replace(/_\d+x\d+\.\w+$/, "");
  return new RegExp(`(^|[^0-9])0*${ref}([^0-9]|$)`).test(stem);
}

export function colekaNinjaRanksListingPageUrls(): string[] {
  const base = `${COLEKA_NINJA_RANKS_ORIGIN}${COLEKA_NINJA_RANKS_LISTING_PATH}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
}

export function parseColekaNinjaRanksListing(
  html: string,
): ColekaNinjaRanksParse {
  const byNumber = new Map<string, ColekaNinjaRanksCard>();
  const rejected: ColekaNinjaRanksParse["rejected"] = [];

  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const refMatch = inner.match(
      /<span class="ref">\s*Ref\.\s*(\d{1,4})\s*<\/span>/i,
    );
    if (!refMatch) continue;
    const ref = Number.parseInt(refMatch[1]!, 10);
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    if (!title || !img || !attrs.includes("href=")) continue;
    const name = decodeEntities(title[1]!);
    const thumbUrl = img[1]!;

    if (!Number.isFinite(ref) || ref < 1 || ref > NINJA_RANKS_BASE_CARDS) {
      rejected.push({
        ref,
        name,
        reason: `hors du set de base (1–${NINJA_RANKS_BASE_CARDS}) : la séquence Coleka au-delà n'est pas attestée`,
      });
      continue;
    }
    if (thumbIsPlaceholder(thumbUrl)) {
      rejected.push({
        ref,
        name,
        reason:
          "gabarit « pas encore photographiée » : le nom de fichier répète le slug de la collection",
      });
      continue;
    }
    if (!thumbCorroboratesRef(thumbUrl, ref)) {
      rejected.push({
        ref,
        name,
        reason:
          "le nom de fichier ne porte pas le numéro — un seul signal ne suffit pas",
      });
      continue;
    }

    const number = String(ref).padStart(4, "0");
    if (byNumber.has(number)) continue;
    byNumber.set(number, {
      number,
      colekaRef: ref,
      name,
      thumbUrl,
      faceUrl: colekaNinjaRanksFaceUrl(thumbUrl),
    });
  }

  return {
    cards: [...byNumber.values()].sort((a, b) => a.colekaRef - b.colekaRef),
    rejected,
  };
}
