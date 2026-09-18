/**
 * « Il me manque 47 cartes — qu'est-ce que j'achète ? »
 *
 * La question d'un collectionneur n'est pas *ce qui manque* mais *ce qu'il faut
 * acheter*, et ce sont deux réponses différentes. Ce module compare les options
 * et dit laquelle recommander, sans jamais masquer les autres.
 *
 * **Deux familles de produits, deux mathématiques.** C'est la distinction qui
 * décide de ce qu'on a le droit de promettre :
 *
 * - Un **contenu connu** — deck, coffret — donne un chiffre exact : on sait ce
 *   qu'il y a dedans, donc combien de cartes neuves il apporte.
 * - Un **contenu aléatoire** — booster, display — ne donne qu'une espérance,
 *   qui décroît à mesure que la collection se remplit. Les premières boîtes
 *   apportent beaucoup, les dernières presque rien.
 *
 * L'interface doit dire laquelle des deux elle affiche. Un chiffre exact et une
 * espérance ne se comparent pas sans le préciser.
 */
import { printLanguageLabel } from "@/lib/shared/printLanguages";

/** Ce qu'un produit fait des cartes qu'il contient. */
export type ProductBehavior =
  "known_bundle" | "mixed_bundle" | "random_pack" | "pack_container";

export type BuyProduct = {
  slug: string;
  name: string;
  kind: string;
  behavior: ProductBehavior;
  setId?: string | null;
  /** Les tirages que le produit contient, quand ils sont connus. */
  prints?: readonly string[] | null;
  /** `true` quand `prints` n'est qu'un aperçu, pas le contenu réel. */
  printsArePreview?: boolean;
  /**
   * Combien de cartes le produit annonce.
   *
   * **Attention à ce que ça veut dire selon le produit.** Sur un paquet
   * aléatoire, ce chiffre est la taille du **pool** — mesuré chez Lorcana, les
   * boosters annoncent 222 à 452, soit le set entier, pas les douze cartes du
   * sachet. Le prendre pour la taille du paquet faisait annoncer qu'un booster
   * apportait les seize cartes manquantes d'un coup.
   *
   * Sur un contenu connu, c'est bien le nombre de cartes du produit.
   */
  cardCount?: number | null;
  /**
   * Combien de cartes le paquet contient, quand on le sait.
   *
   * Le seul endroit où l'information se trouve chez Lorcana est le **nom du
   * produit** — « Booster 12 cartes Premier Chapitre ». C'est la boutique qui
   * l'écrit, pas nous qui le devinons ; absent, on ne calcule aucune espérance
   * plutôt que d'en inventer une.
   */
  packSize?: number | null;
  /**
   * Sachets dans une boîte (display), lus dans le nom / slug —
   * « display-24-boosters-… ». Sert à dire « ~24 boosters → prends le display ».
   */
  packsInContainer?: number | null;
  /**
   * Sachets **par extension** pour un coffret multi-séries (tin S1+S2+deck S4).
   *
   * Sans ça, un SKU à `setId` null n'entre dans aucun conseil d'achat, et un
   * total de sachets unique attribuait la loterie au mauvais set.
   */
  packsBySet?: Readonly<Record<string, number>> | null;
  /**
   * Extensions où les **garanties** comptent (deck Invocation → `s4`, promo →
   * `promo`). Sans ça, un printKey partagé / mal rangé au catalogue accrochait
   * le coffret à une série où il n'apporte rien (ex. NI-0049 listé S5).
   */
  guaranteeSets?: readonly string[] | null;
  priceCents?: number | null;
  /** Packshot (`/assets/…/products/…` ou CDN), quand on en a un. */
  imageUrl?: string | null;
  /**
   * Liste garantie **complète** (tous les tirages distincts connus), même si
   * `cardCount` compte des copies (playset 2×). Sans ça, 38 printKeys pour 40
   * cartes physiques lisaient « au moins » à tort.
   */
  contentsKnown?: boolean;
  /**
   * Langue du produit scellé (`fr`, `en`, …).
   *
   * Un booster d'une autre langue que les cartes de la série (ou que le filtre
   * de check-list) n'entre pas dans les options — voir `allowedLanguages`.
   */
  language?: string | null;
  /**
   * Portée du tirage aléatoire. `listed` = carte(s) parmi `randomPoolPrints`
   * (ex. avant-première manga Naruto), pas le set entier.
   */
  randomPoolScope?: "set" | "listed" | "none" | "unknown" | null;
  /** Pool listé quand `randomPoolScope === "listed"`. */
  randomPoolPrints?: readonly string[] | null;
};

export type BuyOption = {
  slug: string;
  name: string;
  kind: string;
  /**
   * Cartes neuves apportées, à lire **selon `certainty`** :
   *
   * - `exact` — on connaît tout le contenu, c'est un compte.
   * - `atLeast` — contenu fixe dont on ne connaît qu'une partie : un plancher.
   * - `expected` — contenu aléatoire : une espérance.
   * - `unknown` — rien à dire, et `newCards` vaut zéro.
   */
  newCards: number;
  certainty: "exact" | "atLeast" | "expected" | "unknown";
  priceCents: number | null;
  /** Coût par carte neuve, quand on connaît le prix. Sert au classement. */
  centsPerNewCard: number | null;
  /** Pourquoi ce chiffre, en une phrase que l'interface peut afficher. */
  basis: string;
  /** Packshot du produit, pour l'afficher à côté du nom. */
  imageUrl?: string | null;
  language?: string | null;
  /**
   * `true` quand le produit est annoncé dans une autre langue que la
   * check-list : utile, mais ne complète pas les trous ciblés.
   */
  languageMismatch?: boolean;
};

/**
 * L'espérance de cartes **neuves** dans un paquet aléatoire.
 *
 * Sans taux de tirage : borne haute uniforme `m × u/s` (ignore les raretés).
 *
 * Avec `packsPerHitByPrint` (issu de la composition curated) : somme des
 * P(hit) ≈ 1/packsPerHit pour chaque manquante — honête pour les chase
 * (Enchanted ≈ 1/1152 pour un print précis sur 12).
 */
export function expectedNewCards(input: {
  packSize: number;
  poolSize: number;
  missing: number;
  /** printKey → sachets moyens pour toucher CE print. */
  packsPerHitByPrint?: ReadonlyMap<string, number>;
  missingKeys?: readonly string[];
  /**
   * Sachets ouverts d'un coup (1 booster, 24 pour un display).
   * Uniforme et curated : \(1-(1-p)^k\).
   */
  packsOpened?: number;
}): number {
  const packsOpened = Math.max(1, input.packsOpened ?? 1);
  const rates = input.packsPerHitByPrint;
  const keys = input.missingKeys;
  if (rates && keys && keys.length > 0) {
    let sum = 0;
    let covered = 0;
    for (const key of keys) {
      const packs = rates.get(key);
      if (packs != null && packs > 0) {
        const p = 1 / packs;
        // k sachets : 1 − (1−p)^k, pas k×p (display ≠ 24 tirages indépendants du pool).
        sum += 1 - (1 - p) ** packsOpened;
        covered += 1;
      }
    }
    if (covered > 0) {
      // Manquantes sans taux : borne uniforme sur le reste du pool.
      const uncovered = keys.length - covered;
      if (uncovered > 0 && input.packSize > 0 && input.poolSize > 0) {
        const p = Math.min(1, input.packSize / input.poolSize);
        sum += uncovered * (1 - (1 - p) ** packsOpened);
      }
      return Math.round(Math.min(sum, keys.length) * 10) / 10;
    }
  }

  const { packSize, poolSize, missing } = input;
  if (packSize <= 0 || poolSize <= 0 || missing <= 0) return 0;
  /*
    Un display = k sachets, pas un sachet de `packSize` cartes. L'ancien
    modèle uniforme ignorait `packsOpened` dès que `packSize` (cartes/sachet)
    était renseigné → display et booster affichaient le même +9,3.
  */
  const p = Math.min(1, packSize / poolSize);
  const expected =
    packsOpened === 1
      ? Math.min(packSize * (missing / poolSize), missing)
      : missing * (1 - (1 - p) ** packsOpened);
  return Math.round(Math.min(expected, missing) * 10) / 10;
}

/**
 * Combien de boosters pour que l'**espérance** de manquantes passe sous 1.
 *
 * Sans taux : modèle Panini uniforme \(u(1-m/s)^k\).
 *
 * Avec taux hétérogènes : \(\sum_i (1-p_i)^k &lt; 1\) (recherche dichotomique).
 */
export function boostersToExpectNearComplete(input: {
  missing: number;
  poolSize: number;
  packSize: number;
  /** Sachets moyens pour chaque manquante (print précis). */
  packsPerHitForMissing?: readonly number[];
}): number | null {
  const rates = input.packsPerHitForMissing?.filter((p) => p > 0) ?? [];
  if (rates.length > 0) {
    const probs = rates.map((packs) => 1 / packs);
    const expectedAt = (k: number) =>
      probs.reduce((sum, p) => sum + (1 - p) ** k, 0);
    if (expectedAt(0) < 1) return 0;
    let lo = 1;
    let hi = 1;
    while (expectedAt(hi) >= 1 && hi < 1_000_000) hi *= 2;
    if (expectedAt(hi) >= 1) return null;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (expectedAt(mid) < 1) hi = mid;
      else lo = mid + 1;
    }
    return Math.max(1, lo);
  }

  const missing = Math.floor(input.missing);
  const { poolSize, packSize } = input;
  if (missing <= 0) return 0;
  if (poolSize <= 0 || packSize <= 0) return null;
  if (packSize >= poolSize) return 1;

  const escape = 1 - packSize / poolSize;
  if (!(escape > 0 && escape < 1)) return null;

  /*
    u * r^k < 1 ⇒ k > ln(1/u) / ln(r). Pour u = 1, ln(1) = 0 : on vise alors
    E[restant] < 1/2, sinon le premier sachet « suffit » sur le papier alors
    qu'une seule manquante demande en moyenne ~s/m essais.
  */
  const target = missing === 1 ? 0.5 : 1;
  const ratio = target / missing;
  if (!(ratio > 0 && ratio < 1)) return 1;
  const k = Math.log(ratio) / Math.log(escape);
  if (!Number.isFinite(k) || k < 0) return null;
  return Math.max(1, Math.ceil(k));
}

const RANDOM: ReadonlySet<ProductBehavior> = new Set([
  "random_pack",
  "pack_container",
]);

/**
 * Projette un scellé sur **une** extension pour le conseil d'achat.
 *
 * - `packsBySet` renseigné → sachets pour ce set (loterie seule sur ces sets).
 * - `guaranteeSets` → les garanties ne comptent que sur ces extensions
 *   (évite qu'un reprint catalogue accroche le coffret ailleurs).
 * - Sinon `setId` primaire → produit inchangé (comportement historique).
 * - Sinon garanties seules (SKU multi-set sans setId) → packs à 0 sur ce set.
 */
export function projectBuyProductForSet(
  product: BuyProduct,
  setId: string,
  printSetIds: ReadonlyMap<string, string>,
): BuyProduct | null {
  const sid = setId.trim();
  if (!sid) return null;

  const packsBySet = product.packsBySet;
  const hasPacksBySet =
    packsBySet != null && Object.keys(packsBySet).length > 0;
  const guaranteeSets = (product.guaranteeSets ?? [])
    .map((row) => row.trim())
    .filter(Boolean);
  const hasGuaranteeSets = guaranteeSets.length > 0;
  const guaranteesHere = hasGuaranteeSets && guaranteeSets.includes(sid);

  const packsInContainer = hasPacksBySet
    ? Math.max(0, packsBySet![sid] ?? 0)
    : product.setId === sid
      ? (product.packsInContainer ?? null)
      : 0;

  const allPrints = product.prints ?? [];
  const printsMappedHere = allPrints.filter((key) => {
    const printSet = printSetIds.get(key);
    if (printSet) return printSet === sid;
    return !hasPacksBySet && !hasGuaranteeSets && product.setId === sid;
  });

  /*
    Sur un set « sachet seul » (S1 du Coffret Métal), on n'injecte pas les
    garanties : un NI du deck Invocation mal rangé en S1 au catalogue
    gonflait le conseil. Les garanties ne passent que via `guaranteeSets`.
  */
  const printsForSet =
    hasPacksBySet || hasGuaranteeSets
      ? guaranteesHere
        ? printsMappedHere
        : []
      : printsMappedHere;

  const attach = hasPacksBySet || hasGuaranteeSets
    ? (packsInContainer ?? 0) > 0 || printsForSet.length > 0
    : product.setId === sid ||
      (!product.setId && printsForSet.length > 0);

  if (!attach) return null;

  if (!hasPacksBySet && !hasGuaranteeSets && product.setId === sid) {
    return { ...product, setId: sid };
  }

  return {
    ...product,
    setId: sid,
    prints: printsForSet,
    packsInContainer,
  };
}

/**
 * Index setId → produits projetés (coffrets multi-séries inclus).
 */
export function projectBuyProductsBySet(input: {
  products: readonly BuyProduct[];
  printSetIds: ReadonlyMap<string, string>;
}): Map<string, BuyProduct[]> {
  const out = new Map<string, BuyProduct[]>();
  for (const product of input.products) {
    const candidates = new Set<string>();
    if (product.setId) candidates.add(product.setId);
    if (product.packsBySet) {
      for (const setId of Object.keys(product.packsBySet)) {
        if (setId.trim()) candidates.add(setId.trim());
      }
    }
    for (const setId of product.guaranteeSets ?? []) {
      if (setId.trim()) candidates.add(setId.trim());
    }
    if (!(product.guaranteeSets ?? []).length) {
      for (const key of product.prints ?? []) {
        const setId = input.printSetIds.get(key);
        if (setId) candidates.add(setId);
      }
      if (product.randomPoolScope === "listed") {
        for (const key of product.randomPoolPrints ?? []) {
          const setId = input.printSetIds.get(key);
          if (setId) candidates.add(setId);
        }
      }
    }
    for (const setId of candidates) {
      const projected = projectBuyProductForSet(
        product,
        setId,
        input.printSetIds,
      );
      if (!projected) continue;
      const rows = out.get(setId) ?? [];
      rows.push(projected);
      out.set(setId, rows);
    }
  }
  return out;
}

function normalizeLang(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toLowerCase() ?? "";
  return trimmed && trimmed !== "unknown" ? trimmed : null;
}

/**
 * `true` si le scellé peut figurer dans les conseils pour ces langues de cartes.
 *
 * - Pas d'allowlist → tout passe (catalogue sans `set.languages`).
 * - Produit sans langue annoncée → on le garde (mieux que d'inventer un refus).
 * - Sinon la langue du produit doit être dans l'allowlist.
 */
export function sealedProductAllowed(
  productLanguage: string | null | undefined,
  allowedLanguages: ReadonlySet<string> | readonly string[] | null | undefined,
): boolean {
  const allowed = toLangSet(allowedLanguages);
  if (!allowed || allowed.size === 0) return true;
  const lang = normalizeLang(productLanguage);
  if (!lang) return true;
  return allowed.has(lang);
}

function toLangSet(
  languages: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> | null {
  if (languages == null) return null;
  const out = new Set<string>();
  for (const code of languages) {
    const lang = normalizeLang(code);
    if (lang) out.add(lang);
  }
  return out;
}

/**
 * 0 = langue préférée (ou inconnue) · 1 = autre langue.
 *
 * Utile quand plusieurs langues sont **autorisées** (FR+EN) et qu'on veut
 * quand même ranger la locale de la check-list devant.
 */
export function sealedLanguageRank(
  productLanguage: string | null | undefined,
  preferredLanguage: string | null | undefined,
): number {
  const preferred = normalizeLang(preferredLanguage);
  if (!preferred) return 0;
  const lang = normalizeLang(productLanguage);
  if (!lang || lang === preferred) return 0;
  return 1;
}

/**
 * Même kind, plusieurs langues → drapeau devant le nom commun.
 *
 * Les noms de produits doivent déjà être alignés (`Booster Série 1` partout) ;
 * le drapeau ne fait que départager sans inventer un sous-titre local.
 */
export function withSealedLanguageFlags(
  options: readonly BuyOption[],
): BuyOption[] {
  const langsByKind = new Map<string, Set<string>>();
  for (const option of options) {
    const lang = normalizeLang(option.language);
    if (!lang) continue;
    const set = langsByKind.get(option.kind) ?? new Set<string>();
    set.add(lang);
    langsByKind.set(option.kind, set);
  }
  return options.map((option) => {
    const langs = langsByKind.get(option.kind);
    const lang = normalizeLang(option.language);
    if (!langs || langs.size < 2 || !lang) return option;
    const { flag } = printLanguageLabel(lang);
    const prefix = flag || lang.toUpperCase();
    if (option.name.startsWith(`${prefix} `) || option.name.startsWith(prefix)) {
      return option;
    }
    return { ...option, name: `${prefix} ${option.name}` };
  });
}

/**
 * Ce que chaque produit apporterait, du meilleur rapport au moins bon.
 *
 * Le classement se fait sur le **coût par carte neuve**, pas sur le nombre de
 * cartes : un display qui apporte trente cartes pour cent euros est un moins
 * bon achat qu'un deck qui en apporte dix pour cinq. Un produit sans prix est
 * rendu quand même, en fin de liste — l'ignorer cacherait une option, et
 * l'utilisateur connaît peut-être son prix.
 *
 * **Langue.** Seuls les scellés dont la langue est dans `allowedLanguages`
 * (langues des cartes de la série, ou filtre check-list) entrent en priorité.
 * Si **aucun** n'y passe, on replie sur les autres langues du set avec
 * `languageMismatch` — sinon Sage's Legacy FR afficherait « aucun scellé »
 * alors que booster/display EN existent.
 */
export function buyOptionsForMissing(input: {
  missing: ReadonlySet<string>;
  poolSize: number;
  products: readonly BuyProduct[];
  /**
   * Langues des cartes de la série (ou filtre UI). Absent / vide = pas de
   * filtre langue. Hors allowlist : omis **sauf** si l'allowlist ne laisse
   * aucun produit — alors repli avec `languageMismatch`.
   */
  allowedLanguages?: ReadonlySet<string> | readonly string[] | null;
  /**
   * Langue de la check-list — parmi les options autorisées, celle-ci pèse plus.
   * Si `allowedLanguages` est absent et qu'on passe seulement ceci, sert aussi
   * d'allowlist d'une seule langue (filtre check-list).
   */
  preferredLanguage?: string | null;
  /**
   * Taux de tirage par print (composition curated). Absent = uniforme.
   * printKey → sachets moyens pour toucher CE print.
   */
  packsPerHitByPrint?: ReadonlyMap<string, number>;
}): BuyOption[] {
  const preferred = normalizeLang(input.preferredLanguage);
  const allowed =
    toLangSet(input.allowedLanguages) ??
    (preferred ? new Set([preferred]) : null);

  const matching: BuyProduct[] = [];
  const otherLang: BuyProduct[] = [];
  for (const product of input.products) {
    if (sealedProductAllowed(product.language, allowed)) matching.push(product);
    else otherLang.push(product);
  }
  /*
    Filtre FR + seuls scellés EN (s24 Sage's Legacy) : mieux vaut montrer le
    booster EN avec drapeau que de prétendre qu'il n'existe pas.
  */
  const pool = matching.length > 0 ? matching : otherLang;
  const forceMismatch = matching.length === 0 && otherLang.length > 0;

  return scoreBuyOptions({
    ...input,
    products: pool,
    preferredLanguage: preferred,
    forceLanguageMismatch: forceMismatch,
  });
}

function scoreBuyOptions(input: {
  missing: ReadonlySet<string>;
  poolSize: number;
  products: readonly BuyProduct[];
  preferredLanguage?: string | null;
  packsPerHitByPrint?: ReadonlyMap<string, number>;
  forceLanguageMismatch?: boolean;
}): BuyOption[] {
  const options: BuyOption[] = [];
  const preferred = normalizeLang(input.preferredLanguage);
  const missingKeys = [...input.missing];
  const seenSlugs = new Set<string>();

  for (const product of input.products) {
    const slug = product.slug.trim();
    if (slug) {
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
    }
    const random = RANDOM.has(product.behavior);
    const listed = product.prints ?? [];
    const hits = listed.filter((key) => input.missing.has(key)).length;
    const language = normalizeLang(product.language);
    const languageMismatch = Boolean(
      input.forceLanguageMismatch ||
        (preferred && language && language !== preferred),
    );

    let newCards: number;
    let certainty: BuyOption["certainty"];
    let basis: string;

    /*
      Pool listé (1 carte parmi N variantes connues) : espérance = part des
      manquantes dans le pool × tirages. Pas la formule set-entier des boosters.
    */
    if (random && product.randomPoolScope === "listed") {
      const pool = product.randomPoolPrints ?? [];
      const missingInPool = pool.filter((key) => input.missing.has(key)).length;
      const draws =
        product.cardCount != null && product.cardCount > 0
          ? product.cardCount
          : 1;
      if (pool.length === 0) {
        newCards = 0;
        certainty = "unknown";
        basis = "Pool listé vide — rien à estimer.";
      } else {
        newCards =
          Math.round((missingInPool / pool.length) * draws * 10) / 10;
        certainty = "expected";
        basis = `Pool listé : ${draws} carte(s) parmi ${pool.length} (${missingInPool} manquante(s) dans le pool).`;
      }
      if (languageMismatch) {
        basis += ` Produit en ${language} — ne complète pas une liste ${preferred}.`;
      }
    } else if (!random && listed.length > 0 && !product.printsArePreview) {
      /*
        Liste complète des **tirages distincts** → exact. `cardCount` peut être
        plus grand (copies en playset : 2× Haku) : ce n'est pas une lacune de
        liste. Liste partielle (coffret dont on ne connaît que les promos) →
        plancher — sauf si le ledger dit `contentsKnown` (tous les printKeys
        distincts sont là).
      */
      const shortOfDeclared =
        product.cardCount != null &&
        product.cardCount > 0 &&
        listed.length < product.cardCount;
      /*
        `mixed_bundle` = garanties + sachets. Les hits listés sont un plancher ;
        si on connaît `packSize` × `packsInContainer`, on ajoute l'espérance
        des boosters (sinon un Duopack 2×8 + PR affichait « +0 » dès que la
        promo était déjà possédée).
      */
      if (product.behavior === "mixed_bundle") {
        const cardsPerPack = product.packSize ?? 0;
        const packs = packsOpenedForProduct(product) ?? 0;
        let randomNew = 0;
        if (cardsPerPack > 0 && packs > 0) {
          randomNew = expectedNewCards({
            packSize: cardsPerPack,
            poolSize: input.poolSize,
            missing: input.missing.size,
            packsPerHitByPrint: input.packsPerHitByPrint,
            missingKeys,
            packsOpened: packs,
          });
        }
        newCards =
          Math.round(
            Math.min(hits + randomNew, input.missing.size) * 10,
          ) / 10;
        if (cardsPerPack > 0 && packs > 0) {
          certainty = "expected";
          basis =
            hits > 0
              ? `Mixte : ${hits} garantie(s) manquante(s) + ${packs}×${cardsPerPack} cartes aléatoires.`
              : `Mixte : ${packs} sachets de ${cardsPerPack} cartes aléatoires (garanties déjà possédées ou hors liste).`;
        } else {
          certainty = "atLeast";
          basis = product.cardCount
            ? `Contenu fixe, ${listed.length} des ${product.cardCount} cartes listées.`
            : `Contenu fixe, ${listed.length} cartes garanties listées (reste non inventorié).`;
        }
      } else {
        const partial = shortOfDeclared && !product.contentsKnown;
        newCards = hits;
        certainty = partial ? "atLeast" : "exact";
        basis = partial
          ? product.cardCount
            ? `Contenu fixe, ${listed.length} des ${product.cardCount} cartes listées.`
            : `Contenu fixe, ${listed.length} cartes garanties listées (reste non inventorié).`
          : product.contentsKnown && shortOfDeclared
            ? `Contenu connu : ${listed.length} tirages distincts (${product.cardCount} copies).`
            : `Contenu connu : ${listed.length} cartes listées.`;
      }
    } else if (!random && listed.length > 0) {
      /*
        **Un contenu fixe partiellement connu n'est pas un tirage au sort.**
        Un deck de démarrage contient toujours les mêmes cartes ; si nous n'en
        connaissons que quinze sur vingt-huit, l'inconnue est notre relevé, pas
        le produit. Lui appliquer la formule des paquets aléatoires affichait
        « +1,7 » — une probabilité là où il n'y en a aucune.

        On rend donc un **plancher** : ce que les cartes listées apportent, en
        disant combien manquent à l'appel.
      */
      newCards = hits;
      certainty = "atLeast";
      basis = product.cardCount
        ? `Contenu fixe, ${listed.length} des ${product.cardCount} cartes listées.`
        : `Contenu fixe, ${listed.length} cartes listées sur un total inconnu.`;
    } else if (product.behavior === "mixed_bundle") {
      /*
        Mixte sans liste de garanties (ou preview) : quand même estimer les
        sachets si la quantité est connue.
      */
      const cardsPerPack = product.packSize ?? 0;
      const packs = packsOpenedForProduct(product) ?? 0;
      if (cardsPerPack > 0 && packs > 0) {
        newCards = expectedNewCards({
          packSize: cardsPerPack,
          poolSize: input.poolSize,
          missing: input.missing.size,
          packsPerHitByPrint: input.packsPerHitByPrint,
          missingKeys,
          packsOpened: packs,
        });
        certainty = "expected";
        basis = `Mixte : ${packs} sachets de ${cardsPerPack} cartes aléatoires.`;
      } else {
        newCards = 0;
        certainty = "unknown";
        basis = "Contenu fixe, mais aucune carte listée — rien à dire.";
      }
    } else if (!random) {
      newCards = 0;
      certainty = "unknown";
      basis = "Contenu fixe, mais aucune carte listée — rien à dire.";
    } else {
      /*
        Un paquet aléatoire ne se calcule que si l'on sait combien de cartes il
        contient. `cardCount` ne le dit pas — il porte la taille du pool.

        Un display (`pack_container`) exige aussi `packsInContainer` : sans ça
        on n'estime rien — coller à 1 sachet affichait le même +N que le booster.
      */
      const packSize = product.packSize ?? 0;
      const packsOpened = packsOpenedForProduct(product);
      if (!packSize || packsOpened == null) {
        newCards = 0;
        certainty = "unknown";
        basis = !packSize
          ? "Contenu aléatoire, et la taille du paquet n'est pas connue — rien à estimer."
          : "Display sans nombre de sachets connu — rien à estimer.";
      } else {
        newCards = expectedNewCards({
          packSize,
          poolSize: input.poolSize,
          missing: input.missing.size,
          packsPerHitByPrint: input.packsPerHitByPrint,
          missingKeys,
          packsOpened,
        });
        certainty = "expected";
        basis =
          input.packsPerHitByPrint && input.packsPerHitByPrint.size > 0
            ? `Contenu aléatoire : taux de tirage curated (${packSize} cartes / pack × ${packsOpened}).`
            : `Contenu aléatoire : ${packSize} cartes / sachet × ${packsOpened} sachet(s) dans un pool de ${input.poolSize}.`;
      }
      if (languageMismatch) {
        basis += ` Produit en ${language} — ne complète pas une liste ${preferred}.`;
      }
    }

    const priceCents = product.priceCents ?? null;
    options.push({
      slug: product.slug,
      name: product.name,
      kind: product.kind,
      newCards,
      certainty,
      priceCents,
      centsPerNewCard:
        priceCents != null && newCards > 0
          ? Math.round(priceCents / newCards)
          : null,
      basis,
      imageUrl: product.imageUrl ?? null,
      language,
      languageMismatch,
    });
  }

  return withSealedLanguageFlags(
    options.sort((a, b) => {
    /*
      Un produit qui n'apporte rien n'est pas une option, quel que soit son
      prix : il tombe en fin de liste avant même la comparaison des coûts.
    */
    if (a.newCards > 0 !== b.newCards > 0) return a.newCards > 0 ? -1 : 1;
    // Même set, autre langue : visible, jamais devant un produit aligné.
    if (a.languageMismatch !== b.languageMismatch) {
      return a.languageMismatch ? 1 : -1;
    }
    if (a.centsPerNewCard != null && b.centsPerNewCard != null) {
      return a.centsPerNewCard - b.centsPerNewCard;
    }
    // Sans prix des deux côtés, le plus de cartes neuves gagne.
    if (a.centsPerNewCard == null && b.centsPerNewCard == null) {
      return b.newCards - a.newCards;
    }
    // Un prix connu passe devant un prix inconnu : il est comparable.
    return a.centsPerNewCard == null ? 1 : -1;
  }),
  );
}

/**
 * Le coût d'un achat carte par carte, et **où est la falaise**.
 *
 * Mesuré sur les prix collectés : la médiane est à deux centimes et le maximum
 * à deux mille euros. Compléter 95 % d'un set ne coûte presque rien, les 5 %
 * restants coûtent tout. Annoncer « le set complet vous coûtera 2 404 € » est
 * donc inutile ; ce qu'il faut montrer, c'est la marche.
 */
export function singlesCostBreakdown(pricesCents: readonly (number | null)[]): {
  priced: number;
  unpriced: number;
  totalCents: number;
  /** Le coût des 90 % les moins chers, et ce que coûtent les 10 % restants. */
  cheapCount: number;
  cheapCents: number;
  expensiveCount: number;
  expensiveCents: number;
  medianCents: number | null;
} {
  const known = pricesCents
    .filter((price): price is number => price != null && price >= 0)
    .sort((a, b) => a - b);
  const unpriced = pricesCents.length - known.length;
  const totalCents = known.reduce((sum, price) => sum + price, 0);
  const cut = Math.floor(known.length * 0.9);
  const cheap = known.slice(0, cut);
  const expensive = known.slice(cut);
  return {
    priced: known.length,
    unpriced,
    totalCents,
    cheapCount: cheap.length,
    cheapCents: cheap.reduce((sum, price) => sum + price, 0),
    expensiveCount: expensive.length,
    expensiveCents: expensive.reduce((sum, price) => sum + price, 0),
    medianCents: known.length
      ? (known[Math.floor(known.length / 2)] ?? null)
      : null,
  };
}

import {
  cardsPerPackFromShopText,
  packsContainedFromShopText,
} from "./sealedContents";

/**
 * @deprecated Prefer `cardsPerPackFromShopText` — alias conservé pour les tests.
 */
export const packSizeFromName = cardsPerPackFromShopText;

/**
 * @deprecated Prefer `packsContainedFromShopText`.
 */
export const packsInContainerFromText = packsContainedFromShopText;

/**
 * Sachets ouverts d'un coup pour l'espérance.
 *
 * - `random_pack` → 1
 * - `pack_container` → `packsInContainer`, ou `null` si inconnu (**jamais** 1
 *   par défaut : un display sans taille de boîte ne doit pas coller au booster)
 * - `mixed_bundle` → `packsInContainer` (0 = garanties seules)
 */
export function packsOpenedForProduct(product: BuyProduct): number | null {
  if (product.behavior === "pack_container") {
    const packs = product.packsInContainer;
    return packs != null && packs > 0 ? packs : null;
  }
  if (product.behavior === "mixed_bundle") {
    const packs = product.packsInContainer;
    return packs != null && packs > 0 ? packs : 0;
  }
  return 1;
}

/**
 * Complète un display : `packSize` (cartes/sachet) et `packsInContainer`
 * depuis les scellés **du même set** — jamais un booster d'une autre série,
 * jamais `packs × cartes` fusionnés (voir {@link expectedNewCards}).
 */
export function withContainerPackSizes(
  products: readonly BuyProduct[],
): BuyProduct[] {
  type SetHints = {
    packSizeByLang: Map<string, number>;
    anyPackSize: number | null;
    packsByLang: Map<string, number>;
    anyPacks: number | null;
  };
  const bySet = new Map<string, SetHints>();

  const hint = (setId: string | null | undefined): SetHints => {
    const key = (setId ?? "").trim() || "*";
    let row = bySet.get(key);
    if (!row) {
      row = {
        packSizeByLang: new Map(),
        anyPackSize: null,
        packsByLang: new Map(),
        anyPacks: null,
      };
      bySet.set(key, row);
    }
    return row;
  };

  for (const product of products) {
    const row = hint(product.setId);
    const lang = normalizeLang(product.language) ?? "";
    if (
      product.behavior === "random_pack" &&
      product.packSize != null &&
      product.packSize > 0
    ) {
      if (!row.packSizeByLang.has(lang)) {
        row.packSizeByLang.set(lang, product.packSize);
      }
      if (row.anyPackSize == null) row.anyPackSize = product.packSize;
    }
    if (
      product.behavior === "pack_container" &&
      product.packsInContainer != null &&
      product.packsInContainer > 0
    ) {
      if (!row.packsByLang.has(lang)) {
        row.packsByLang.set(lang, product.packsInContainer);
      }
      if (row.anyPacks == null) row.anyPacks = product.packsInContainer;
    }
  }

  return products.map((product) => {
    if (product.behavior !== "pack_container") return product;
    const row = hint(product.setId);
    const lang = normalizeLang(product.language) ?? "";
    const packSize =
      product.packSize != null && product.packSize > 0
        ? product.packSize
        : (row.packSizeByLang.get(lang) ?? row.anyPackSize ?? null);
    const packsInContainer =
      product.packsInContainer != null && product.packsInContainer > 0
        ? product.packsInContainer
        : (row.packsByLang.get(lang) ?? row.anyPacks ?? null);
    if (
      (packSize == null || packSize === product.packSize) &&
      (packsInContainer == null ||
        packsInContainer === product.packsInContainer)
    ) {
      return product;
    }
    return {
      ...product,
      ...(packSize != null ? { packSize } : null),
      ...(packsInContainer != null ? { packsInContainer } : null),
    };
  });
}

/**
 * Sous ce seuil d'espérance (cartes neuves / booster), le scellé n'est plus
 * une stratégie d'achat : on est en fin de set. Le modèle uniforme ignore les
 * raretés chase (enchanted Lorcana ≈ 1/96) et surestime fortement le fill.
 */
export const SEALED_MIN_EXPECTED_NEW = 1;

export type CompletionPlan = {
  /**
   * Trous à prendre **à l'unité** : chase (au-dessus du €/carte neuve d'un
   * booster) toujours, et **tous** les trous cotés en fin de set.
   */
  buySinglesCount: number;
  buySinglesCents: number;
  /**
   * Trous bon marché encore « fillables » en scellé (milieu de set seulement).
   * Jamais les chase cotées : le marché les vend en singles.
   */
  sealedHoles: number;
  /**
   * Sachets pour combler les **trous scellés** (après retraits singles), via
   * {@link boostersToExpectNearComplete} — sert aussi à booster vs display.
   */
  boostersExpected: number | null;
  /**
   * Sachets pour espérer finir **tout** le set (E[manquantes] &lt; 1).
   * `null` en fin de set / quand on préfère les singles : le chiffre Panini
   * uniforme tromperait (ex. « 46 boosters » pour 12 enchanted).
   */
  boostersToComplete: number | null;
  /** Option à badge « Recommandé » — display si le volume colle à la boîte. */
  recommendedSlug: string | null;
  /**
   * `true` quand le plan dit d'acheter les singles (fin de set ou plus de
   * fill scellé). L'UI ne doit alors pas teaser un booster / display.
   */
  preferSingles: boolean;
};

/** Un produit scellé qui **garantit** une carte (starter, promo de gift…). */
export type SealedPrintSource = {
  slug: string;
  name: string;
  kind: string;
  imageUrl?: string | null;
};

/**
 * Index inverse : printKey → produits scellés « Inclus dans » pour la check-list.
 *
 * - Contenu fixe / mixtes : liste **garantie** (`prints`).
 * - Pool **listé** (`randomPoolScope: listed`) : chaque clé du pool (manga
 *   avant-première, etc.).
 *
 * Un booster / display à loterie **set** n'entre **pas** ici : leur pool = le
 * set entier, pas une promesse carte par carte.
 */
export function sealedSourcesByPrint(
  products: readonly BuyProduct[],
): Map<string, SealedPrintSource[]> {
  const out = new Map<string, SealedPrintSource[]>();
  for (const product of products) {
    if (product.printsArePreview) continue;
    const source: SealedPrintSource = {
      slug: product.slug,
      name: product.name,
      kind: product.kind,
      imageUrl: product.imageUrl ?? null,
    };
    const keys: string[] = [];
    if (product.randomPoolScope === "listed") {
      keys.push(...(product.randomPoolPrints ?? []));
    } else if (!RANDOM.has(product.behavior)) {
      keys.push(...(product.prints ?? []));
    }
    if (keys.length === 0) continue;
    for (const key of keys) {
      const list = out.get(key) ?? [];
      if (!list.some((row) => row.slug === source.slug)) list.push(source);
      out.set(key, list);
    }
  }
  return out;
}

/**
 * Plan d'achat aligné sur le consensus collectionneurs TCG :
 *
 * - **Fin de set** (espérance &lt; {@link SEALED_MIN_EXPECTED_NEW} neuves /
 *   booster, **quand on a un modèle de sachet**) → **singles** pour les
 *   trous **cotés**. Sans cote, on ne dit pas « préférer les singles ».
 * - **Milieu de set** → chase en singles ; bulk en fill scellé / display.
 * - Sans taille de sachet connue : pas de volume Panini inventé, pas de
 *   message fin-de-set (cas Naruto display EN seul, etc.).
 */
export function planSetCompletion(input: {
  missingPrices: ReadonlyMap<string, number | null>;
  poolSize: number;
  options: readonly BuyOption[];
  products: readonly BuyProduct[];
  /** Taux curated printKey → sachets pour ce print. */
  packsPerHitByPrint?: ReadonlyMap<string, number>;
}): CompletionPlan {
  const matching = input.options.filter((option) => !option.languageMismatch);
  const pool = matching.length > 0 ? matching : input.options;
  const packSizeOf = (slug: string): number =>
    input.products.find((product) => product.slug === slug)?.packSize ?? 0;

  const sizedBooster = pool.find(
    (option) =>
      option.kind === "booster" &&
      option.newCards > 0 &&
      packSizeOf(option.slug) > 0,
  );
  const pricedBooster = pool.find(
    (option) =>
      option.kind === "booster" &&
      option.newCards > 0 &&
      option.centsPerNewCard != null &&
      packSizeOf(option.slug) > 0,
  );
  const booster = pricedBooster ?? sizedBooster;
  const threshold = pricedBooster?.centsPerNewCard ?? null;

  /*
    Taille de sachet : d'abord le booster du pool (langue OK), sinon n'importe
    quel `random_pack` du set — un display EN seul ne doit pas faire croire
    qu'on est en « fin de chase ».
  */
  let packSize = booster ? packSizeOf(booster.slug) : 0;
  if (packSize <= 0) {
    const fallback = input.products.find(
      (product) =>
        product.behavior === "random_pack" &&
        (product.packSize ?? 0) > 0 &&
        sealedLanguageRank(
          product.language,
          matching[0]?.language ?? pool[0]?.language,
        ) === 0,
    );
    packSize = fallback?.packSize ?? 0;
  }
  if (packSize <= 0) {
    const anyPack = input.products.find(
      (product) =>
        product.behavior === "random_pack" && (product.packSize ?? 0) > 0,
    );
    packSize = anyPack?.packSize ?? 0;
  }

  const totalMissing = input.missingPrices.size;
  const missingKeys = [...input.missingPrices.keys()];
  const ratesFor = (keys: readonly string[]): number[] => {
    const rates = input.packsPerHitByPrint;
    if (!rates || rates.size === 0) return [];
    return keys
      .map((key) => rates.get(key))
      .filter((packs): packs is number => packs != null && packs > 0);
  };

  const hasPackModel = packSize > 0;
  const expectedNew = hasPackModel
    ? expectedNewCards({
        packSize,
        poolSize: input.poolSize,
        missing: totalMissing,
        packsPerHitByPrint: input.packsPerHitByPrint,
        missingKeys,
      })
    : 0;
  /** Vrai seulement avec un modèle de sachet et une EV trop faible. */
  const endgame = hasPackModel && expectedNew < SEALED_MIN_EXPECTED_NEW;

  const paniniComplete = hasPackModel
    ? boostersToExpectNearComplete({
        missing: totalMissing,
        poolSize: input.poolSize,
        packSize,
        packsPerHitForMissing: ratesFor(missingKeys),
      })
    : null;
  /*
    En fin de set (avec cotes) on masque le volume Panini. Sans cote, le
    volume reste une info utile (« ≈ N boosters ») — pas un « achète des
    singles ».
  */
  const anyPriced = [...input.missingPrices.values()].some(
    (price) => price != null,
  );
  const boostersToComplete =
    endgame && anyPriced ? null : paniniComplete;

  let buySinglesCount = 0;
  let buySinglesCents = 0;
  let sealedHoles = 0;
  for (const price of input.missingPrices.values()) {
    if (price == null) continue;
    /*
      Fin de set : tout ce qui est coté part en singles (même sans seuil
      booster). Milieu de set : seuil obligatoire pour séparer chase / bulk.
    */
    if (endgame) {
      buySinglesCount += 1;
      buySinglesCents += price;
      continue;
    }
    if (threshold == null) continue;
    if (price > threshold) {
      buySinglesCount += 1;
      buySinglesCents += price;
    } else {
      sealedHoles += 1;
    }
  }

  /** Reco singles seulement si on a des trous cotés à pousser. */
  const preferSingles = endgame && buySinglesCount > 0;

  const idle = (): CompletionPlan => ({
    buySinglesCount,
    buySinglesCents,
    sealedHoles: 0,
    boostersExpected: null,
    boostersToComplete,
    recommendedSlug: null,
    preferSingles,
  });

  if (!hasPackModel) return idle();
  if (endgame || sealedHoles <= 0 || !pricedBooster) {
    return {
      buySinglesCount,
      buySinglesCents,
      sealedHoles: endgame ? 0 : sealedHoles,
      boostersExpected: null,
      boostersToComplete,
      recommendedSlug: null,
      preferSingles,
    };
  }

  const sealedKeys = [...input.missingPrices.entries()]
    .filter(([, price]) => price != null && threshold != null && price <= threshold)
    .map(([key]) => key);

  const boostersExpected = boostersToExpectNearComplete({
    missing: sealedHoles,
    poolSize: input.poolSize,
    packSize,
    packsPerHitForMissing: ratesFor(sealedKeys),
  });

  const displayProduct = input.products.find(
    (product) =>
      product.behavior === "pack_container" &&
      (product.packsInContainer ?? 0) > 0 &&
      sealedLanguageRank(
        product.language,
        booster?.language ?? matching[0]?.language,
      ) === 0,
  );
  const packs = displayProduct?.packsInContainer ?? null;
  const displayOption = displayProduct
    ? pool.find((option) => option.slug === displayProduct.slug)
    : null;

  let recommendedSlug: string | null = booster?.slug ?? null;
  if (
    boostersExpected != null &&
    packs != null &&
    displayOption &&
    boostersExpected >= Math.ceil(packs * 0.7)
  ) {
    recommendedSlug = displayOption.slug;
  }

  return {
    buySinglesCount,
    buySinglesCents,
    sealedHoles,
    boostersExpected,
    boostersToComplete,
    recommendedSlug,
    preferSingles: false,
  };
}
