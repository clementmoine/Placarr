/**
 * Which packshot / series wordmark a sealed SKU shows.
 *
 * Same contract as card faces: every host dump stays `art.<source>.<ext>` or
 * `logo.<source>.<ext>` under `products/{slug}/{lang}/`; `face.json` names the
 * winner. The series logo is copied into each SKU folder (Pokémon / Lorcana
 * already do one wordmark per product; Naruto S1–S5 share a GIF — still copy).
 */
import {
  CARD_FACE_DECISION_FILE,
  CARD_FACE_ROLES,
  createCardFaceChoice,
  type StoredFace as SharedStoredFace,
} from "@/providers/shared/cardFaces";

export const NARUTO_PRODUCT_SOURCES = [
  "trictrac",
  "vialudibunda",
  "ebay",
  "cardgameclub",
  "martina",
  "gradedcardcenter",
  "coleka",
  "goat",
  "manga-news",
  "scifi-universe",
  "carddass",
  /** Bandai / TV Tokyo official goods pages — the only visual for the PS bonus. */
  "tvtokyo",
  /**
   * Photos de vendeurs Mercari. Dernier recours : c'est la seule source connue
   * pour l'**emballage** du bonus PS1, recto et verso, qu'aucune page officielle
   * n'a jamais montré.
   */
  "mercari",
  /**
   * カードダスドットコム — la base produit de Bandai. Visuel officiel, donc en
   * tête de l'ordre japonais : c'est l'éditeur qui photographie son propre
   * emballage.
   */
  "carddassofficial",
  /**
   * carddas.com — le **site de jeu** de l'époque, archivé par la Wayback, à ne
   * pas confondre avec la base produit `carddassofficial` : ce sont deux sites
   * de Bandai, et ils ne montrent pas la même chose.
   *
   * La base produit photographie parfois les **cartes** au lieu de l'emballage
   * (巻ノ四 : six cartes, pas un sachet). Le site de jeu, lui, tenait une page
   * par volume avec le sachet, la boîte et le distributeur. C'est la seule
   * source connue pour les sachets des volumes 2, 3, 5, 13, 14 et 15.
   *
   * Contrepartie : les vignettes d'un site de 2003 font 75×144 à 100×212. Elles
   * passent donc **après** la base produit quand celle-ci montre un emballage.
   */
  "carddasjp",
  /**
   * comicplanet.de — la seule source connue pour les packshots **allemands**.
   * Neuf séries de boosters plus un display, en 600×1039, fond détouré.
   */
  "comicplanet",
  /** kingslayercards.com — le wordmark du CCG Shippuden, seul logo anglais connu. */
  "kingslayer",
  /**
   * Suruga-ya, base de rachat (`kaitori`). Le site est derrière Cloudflare,
   * mais son CDN ne l'est pas : `cdn.suruga-ya.jp/database/pics_webp/game/
   * {id}.jpg.webp` répond sur une URL collée. Photos d'emballage à plat.
   */
  "suruga",
  /**
   * Badges de série découpés sur les sachets, un par langue : le français
   * écrit « SÉRIE 4 », l'allemand « SERIE 4 ». 224×88, contre 100×39 pour les
   * `logos_series` de carddass.fr.
   */
  "badge",
  /**
   * Visuels de fiche Amazon, détourés à la main. Origine gardée comme source :
   * ce qui est retouché, c'est le fond, pas la provenance.
   */
  "amazon",
] as const;

export type NarutoProductSource = (typeof NARUTO_PRODUCT_SOURCES)[number];

/** Locale tie-break. Pixels still decide when both dumps measure. */
export const NARUTO_PRODUCT_PRIORITY: Record<
  string,
  readonly NarutoProductSource[]
> = {
  fr: [
    "badge",
    "trictrac",
    "vialudibunda",
    "ebay",
    "manga-news",
    "scifi-universe",
    "carddass",
    "tvtokyo",
    "cardgameclub",
    "martina",
    "gradedcardcenter",
    "coleka",
    "goat",
    "comicplanet",
    "kingslayer",
    "suruga",
    "amazon",
  ],
  /** L'allemand n'a qu'une source de packshot connue : comicplanet.de. */
  de: [
    "badge",
    "comicplanet",
    "trictrac",
    "vialudibunda",
    "ebay",
    "manga-news",
    "scifi-universe",
    "carddass",
    "tvtokyo",
    "cardgameclub",
    "martina",
    "gradedcardcenter",
    "coleka",
    "goat",
    "kingslayer",
    "suruga",
    "amazon",
  ],
  en: [
    "badge",
    "coleka",
    "goat",
    "ebay",
    "trictrac",
    "vialudibunda",
    "carddass",
    "tvtokyo",
    "cardgameclub",
    "martina",
    "gradedcardcenter",
    "manga-news",
    "scifi-universe",
    "comicplanet",
    "kingslayer",
    "suruga",
    "amazon",
  ],
  it: [
    "badge",
    "cardgameclub",
    "martina",
    "coleka",
    "ebay",
    "vialudibunda",
    "trictrac",
    "carddass",
    "tvtokyo",
    "gradedcardcenter",
    "goat",
    "manga-news",
    "scifi-universe",
    "comicplanet",
    "kingslayer",
    "suruga",
    "amazon",
  ],
  ja: [
    "badge",
    "carddassofficial",
    "suruga",
    "gradedcardcenter",
    "carddass",
    "tvtokyo",
    "ebay",
    "coleka",
    "trictrac",
    "vialudibunda",
    "cardgameclub",
    "martina",
    "goat",
    "manga-news",
    "scifi-universe",
    "mercari",
    "comicplanet",
    "kingslayer",
    "amazon",
  ],
};

const STAGING_FOLDER_SOURCE: Readonly<Record<string, NarutoProductSource>> = {
  "comicplanet-de": "comicplanet",
  "ccg-logo": "kingslayer",
  "suruga-kaitori": "suruga",
  "series-badges": "badge",
  wrappers: "mercari",
  "carddass-fr": "carddass",
  trictrac: "trictrac",
  vialudibunda: "vialudibunda",
  ebay: "ebay",
  "manga-news": "manga-news",
  cardgameclub: "cardgameclub",
  martina: "martina",
  gradedcardcenter: "gradedcardcenter",
  "goat-en-boxes": "goat",
  "coleka-en-covers": "coleka",
  "coleka-s24": "coleka",
  "coleka-s28": "coleka",
  "scifi-universe": "scifi-universe",
  "tv-tokyo": "tvtokyo",
  mercari: "mercari",
  "carddass-official": "carddassofficial",
  // Le miroir Wayback du site de jeu, moissonné par `scrapeCarddasJp`.
  "carddas-jp": "carddasjp",
};

const choice = createCardFaceChoice<NarutoProductSource>({
  sources: NARUTO_PRODUCT_SOURCES,
  priority: NARUTO_PRODUCT_PRIORITY,
  coverProvenance: "catalog",
  /*
    Les packshots sont presque tous sous le plancher de 0,2 mégapixel du
    scorer, qui n'y départage plus rien : il ne reste que le bonus de ratio, et
    ce bonus récompense le cadre. Une vignette de boutique 200×300, rembourrée
    jusqu'au 2:3 idéal, y battait une photo 286×500 montrant deux fois plus de
    pack. Sous ce plancher, la taille tranche.
  */
  areaDecidesBelow: 200_000,
});

export const NARUTO_PRODUCT_ROLES = CARD_FACE_ROLES;
export const NARUTO_PRODUCT_DECISION_FILE = CARD_FACE_DECISION_FILE;
export type NarutoProductStoredFace = SharedStoredFace<NarutoProductSource>;

export const narutoProductFilename = choice.faceFilename;
export const narutoProductFileOf = choice.faceFileOf;
export const recordNarutoProductDecision = choice.recordFaceDecision;

export function pickBestNarutoProductDump(
  faces: readonly NarutoProductStoredFace[],
  lang = "fr",
): NarutoProductSource | null {
  return choice.pickBestFace(faces, lang);
}

/** `staging/trictrac/foo.jpeg` → `trictrac`. */
/**
 * Dossiers de `curated/products/` et la source qu'ils portent.
 *
 * Séparé de `STAGING_FOLDER_SOURCE` exprès : `staging/` se reconstruit par
 * script depuis un relevé, `curated/` tient ce qui est fait à la main. Mélanger
 * les deux tables ferait croire qu'un visuel curé se re-télécharge.
 */
const CURATED_FOLDER_SOURCE: Readonly<Record<string, NarutoProductSource>> = {
  "series-badges": "badge",
  "ccg-logo": "kingslayer",
  wrappers: "mercari",
  "comicplanet-de": "comicplanet",
  "jp-boosters": "amazon",
};

export function productSourceFromCuratedFolder(
  folder: string,
): NarutoProductSource | null {
  return CURATED_FOLDER_SOURCE[folder.toLowerCase()] ?? null;
}

export function productSourceFromStagingRel(
  rel: string,
): NarutoProductSource | null {
  const posix = rel.replace(/\\/g, "/").toLowerCase();
  const folder = /(?:^|\/)staging\/([^/]+)/.exec(posix)?.[1];
  if (folder && STAGING_FOLDER_SOURCE[folder]) {
    return STAGING_FOLDER_SOURCE[folder];
  }
  if (posix.includes("packshots")) return "carddass";
  return null;
}

export function narutoProductLangFolder(lang?: string | null): string {
  const code = (lang ?? "fr").trim().toLowerCase();
  if (code === "jap" || code === "jp") return "ja";
  return code || "fr";
}
