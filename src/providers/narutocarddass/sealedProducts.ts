/**
 * CACG sealed SKUs: carddass.fr packshots (FR) + CardGameClub product pages (IT).
 *
 * Staging stays the scrape cache (`images/packshots/` is classified chrome by
 * the card pipeline). Catalogue reads `products-index.json` + copies under
 * `products/` — staging is never served.
 *
 * Manga-News "Deck Série N" lists are the **series** (116–184 numbers), not a
 * starter's 40 cards. We never attach those as known contents. S1–S2 boxes
 * also hold a livret de jeu, a shared-design plateau, 6 jetons and a
 * series-wide livret collection — accessories, not prints
 * (`starter-box-accessories.json`).
 *
 * Série 6 FR was cancelled — no packshot, not a SKU. Italian S6
 * (`starter-il-fascino-del-male`) is a real CACG starter ; `booster-s6-it`
 * (eBay bustina) fills the missing S6 IT pack. Serie 5 IT mazzi Tradimento /
 * Lealtà come from Emporio di Milo shop pastes. JP product shots stay JP.
 * Série 28 display is the Coleka rubric packshot (box + booster), not a
 * Carddass product and not a guessed booster SKU. Retail FR duopack
 * (`duopack-s28`) is 2 boosters + window PR-096 — eBay overlay packshot.
 * Tric Trac starter boxes
 * (cdn10 originals) beat Via Ludibunda / carddass.fr GIFs. Card thumbs on
 * those pages are the same 350×495 as carddass.fr — not a second scan.
 *
 * Italian CACG (same game, different series cuts) uses distinct slugs
 * (`booster-s1-it`, not `booster-s1`). Shop GTINs on CardGameClub are reused
 * ISSN-shaped junk — not barcodes. One S1 mazzo was pasted; do not invent a second.
 * JP 巻ノ五 (`booster-vol5-jp`, set `maki5`) is 6 cards — not FR/IT 8, not
 * Shippuden 第五幕, not `booster-s5`. Goat 3970 fills Coleka-missing EN
 * displays (s16, s19, s21–s23, s27) only — never `display-s1`…`s6`.
 * SciFi-Universe 200px edition thumbs are last-resort FR packshots.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { resolveSealedContents } from "@/core/collect/sealedContents";
import { resolveContentLayers } from "@/providers/shared/sealedProducts/contentLayers";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { dataRoot } from "@/lib/runtimeData";
import {
  emptyProductsIndex,
  sealedProductKey,
  type SealedProductEntry,
} from "@/providers/shared/sealedProducts/indexFormat";
import { sealedBehaviorForKind } from "@/providers/shared/sealedProducts/kinds";
import { cardgameclubIngestPackshots } from "./sources/cardgameclubPackshots";
import { colekaEnCcgNewDisplays } from "./sources/colekaEnCcgCovers";
import { ebayIngestPackshots } from "./sources/ebayPackshots";
import { rakutenIngestPackshots } from "./sources/rakutenPackshots";
import { goatIngestPackshots } from "./sources/goatPackshots";
import { gradedcardcenterIngestPackshots } from "./sources/gradedcardcenterPackshots";
import { germanSealedReleases } from "./sources/germanSealedReleases";
import { japaneseSealedReleases } from "./sources/japaneseSealedReleases";
import { volumeOfficialProducts } from "./volumeOfficialProducts";
import { psYoyakuIngestPackshots } from "./sources/psYoyakuPackshots";
import { narutoCuratedDir, narutoCuratedProductsDir } from "./curatedPaths";
import { NARUTO_PACK_ID } from "./packs";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import { mangaNewsIngestPackshots } from "./sources/mangaNewsPackshots";
import { mangaSanctuaryIngestPackshots } from "./sources/mangaSanctuaryPackshots";
import {
  bandaiFrUsDriveIngestPackshots,
  bandaiFrUsDriveNewEnDisplays,
} from "./sources/bandaiFrUsDrive";
import { martinaIngestPackshots } from "./sources/martinaPackshots";
import { emporiodimiloIngestPackshots } from "./sources/emporiodimiloPackshots";
import {
  vintedIngestBacks,
  vintedIngestPackshots,
} from "./sources/vintedPackshots";
import {
  leboncoinIngestBacks,
  leboncoinIngestPackshots,
} from "./sources/leboncoinPackshots";
import {
  kinkaiIngestBacks,
  kinkaiIngestPackshots,
} from "./sources/kinkaiPackshots";
import {
  sunnystoreIngestBacks,
  sunnystoreIngestPackshots,
} from "./sources/sunnystorePackshots";
import { atomicempireIngestPackshots } from "./sources/atomicempirePackshots";
import { toywizIngestPackshots } from "./sources/toywizPackshots";
import {
  narutoProductFileOf,
  narutoProductFilename,
  narutoProductLangFolder,
  pickBestNarutoProductDump,
  productSourceFromCuratedFolder,
  productSourceFromStagingRel,
  recordNarutoProductDecision,
  type NarutoProductSource,
  type NarutoProductStoredFace,
} from "./productChoice";
import { NARUTO_STAGING_SITE } from "./scrape/scrapeCards";
import { trictracIngestPackshots } from "./sources/trictracPackshots";
import { scifiUniverseIngestPackshots } from "./sources/scifiUniverse";
import { vialudibundaIngestPackshots } from "./sources/vialudibunda";

/** Printed booster (carddass.fr / presse 2006–07). */
export const NARUTO_BOOSTER_CARD_COUNT = 8;
/** Official starter composition (sets.json). */
export const NARUTO_STARTER_CARD_COUNT = 40;

export type NarutoSealedSpec = {
  slug: string;
  kind: SealedProductEntry["kind"];
  category: string;
  setCode: string | null;
  name: string;
  /** Filename under the staging root (`packshots/`, `coleka-s28/`, or EN covers). */
  stagingFile: string;
  /** Default: carddass.fr packshots. EN CCG displays are Coleka rubric covers. */
  stagingKind?:
    | "packshots"
    | "coleka-s28"
    | "coleka-rampage-tornado"
    | "coleka-en-covers"
    | "toywiz"
    | "atomicempire"
    /** Visuel officiel Bandai, sous `staging/carddass-official/`. */
    | "carddass-official"
    /**
     * Site de jeu carddas.com, miroir Wayback sous `staging/carddas-jp/`.
     * `stagingFile` y est le chemin sous `/naruto/`, et il doit l'être : le
     * site tenait **deux** arbres produit — `image/product/` pour les 巻ノ,
     * `cardgame/image/product/` pour les 幕 du 疾風伝. Un préfixe codé en dur
     * n'en servirait qu'un.
     */
    | "carddas-jp"
    /** Packshots allemands, sous `staging/comicplanet-de/`. */
    | "comicplanet-de"
    /** Photos de rachat Suruga-ya, sous `staging/suruga-kaitori/`. */
    | "suruga-kaitori"
    /** Emballages photographiés à la main, sous `curated/products/wrappers/`. */
    | "wrappers"
    /** Sachets japonais détourés, sous `curated/products/jp-boosters/`. */
    | "jp-boosters"
    /** Vignettes des pages TV Tokyo, sous `staging/tv-tokyo/`. */
    | "tv-tokyo";
  /** Printed language on the packshot. Default FR (Carddass). */
  lang?: string;
  /**
   * Le **dos** de l'emballage, sous la racine de staging.
   *
   * Presque toujours absent : les boutiques photographient la face avant. Là
   * où il existe, il porte ce que le recto ne dit pas — éditeur et adresse,
   * service client, mention de distribution, texte de contenu.
   */
  stagingBackFile?: string;
  declaredCardCount: number | null;
  /** Cartes différentes ouvertes par la sortie. */
  setKinds?: number | null;
  /** Date de sortie quand la source la donne (`2003-10-24`, ou `2003` seul). */
  released?: string | null;
  /**
   * Sortie attestée par un relevé curé : elle entre au catalogue même sans
   * packshot. Sans ce drapeau, un SKU sans visuel est sauté — ce qui est juste
   * pour les lignes FR (le dump carddass.fr les a toutes) et faux pour le
   * japonais, dont personne n'a photographié les emballages.
   */
  attested?: boolean;
};

/**
 * One SKU per published FR product we hold a packshot for.
 * Filenames are the carddass.fr dump; names are the two official starters.
 */
export const NARUTO_SEALED_SKUS: readonly NarutoSealedSpec[] = [
  booster("s1", "booster_s1.gif"),
  booster("s2", "booster_s2.gif"),
  booster("s3", "booster_s3.gif"),
  booster("s4", "booster_s4.gif"),
  booster("s5", "BOOSTER_S5.gif"),
  starter(
    "s1",
    "maitre-hokage",
    "Starter Maître Hokage",
    "starter_hokage_s1.gif",
  ),
  starter("s1", "pays-du-vent", "Starter Pays du Vent", "starter_vent_s1.gif"),
  starter(
    "s2",
    "sceller-le-malefice",
    "Starter Sceller le maléfice",
    "starter_sceller_s2.gif",
  ),
  starter(
    "s2",
    "detruire-konoha",
    "Starter Détruire Konoha",
    "starter_detruire_s2.gif",
  ),
  starter(
    "s3",
    "apprentissage",
    "Starter Apprentissage",
    "starter_apprentissage_s3.gif",
  ),
  starter(
    "s3",
    "puissances-cachees",
    "Starter Puissances Cachées",
    "starter_puissances_s3.gif",
  ),
  starter(
    "s4",
    "esprit-du-sable",
    "Starter L'esprit du sable",
    "starter_esprit_s4.gif",
  ),
  starter(
    "s4",
    "invocation",
    "Starter Invocation",
    "starter_invocation_s4.gif",
  ),
  starter("s5", "la-quete", "Starter La quête", "PEM05124_LA_QUETE.gif"),
  starter(
    "s5",
    "un-nouveau-depart",
    "Starter Un nouveau départ",
    "PEM05124_NOUVEAU_DEPART.gif",
  ),
  {
    /*
      Pack Découverte S1 — presse Manga Sanctuary 7397 + inventaire
      Collection Naruto YT JYwlXQQlooI : 2 starters S1 + 2 boosters S1.
      Face catalogue = packshot clean (wrappers/pack-decouverte.jpg) ;
      photos LBC staging/leboncoin/pack-decouverte-* archival / verso.
    */
    slug: "pack-decouverte",
    kind: "coffret",
    category: "collector-boxes",
    setCode: "s1",
    name: "Pack Découverte (Pays du Vent + Maître Hokage + 2 boosters S1)",
    stagingFile: "pack-decouverte.jpg",
    stagingKind: "wrappers",
    lang: "FR",
    declaredCardCount: 96,
    attested: true,
  },
  {
    /*
      L'emballage, lui, dit BOOSTER PACK / ブースターパック（追加拡張）. Et
      pourtant `kind` reste `coffret` : chez nous ce champ décrit un
      comportement, pas la typographie du sachet. `booster` forcerait
      `random_pack` et `contentsKnown: false`, quand le sachet annonce
      « 全4種 » pour 4 cartes — on les a toutes, il n'y a rien d'aléatoire.
      Le mot imprimé est consigné au ledger, le comportement décide ici.
    */
    slug: "ps-yoyaku-tokuten",
    kind: "coffret",
    category: "collector-boxes",
    setCode: null,
    name: "「NARUTO -ナルト-」カードゲーム 忍の里の陣取り合戦！編（4枚セット）",
    stagingFile: "ps-yoyaku-tokuten.gif",
    // Le seul emballage photographié : deux annonces Mercari, recto et verso.
    stagingBackFile: "ps-yoyaku-tokuten-wrapper-back.jpg",
    lang: "JA",
    declaredCardCount: 4,
  },
  {
    /*
      Coffret Métal FR canal grande distribution (Réf. 05129 / EAN
      3296580051298) — verso Leboncoin : deck Invocation s4 + boosters s1/s2
      + 1 promo holo. Distinct de tin-box-hobby (canal magasins spécialisés).
      Face catalogue = Tric Trac fond blanc (staging/trictrac/tin-box.jpeg).
      Tin-boxN.jpg reste sur disque en archival ; ne pas le remonter en
      stagingFile sinon il bat Tric Trac au scorer (surface un peu plus grande).
    */
    slug: "tin-box",
    kind: "coffret",
    category: "collector-boxes",
    setCode: null,
    name: "Coffret Métal",
    stagingFile: "",
    // Total 57 (= 40+8+8+1) dans products-contents — voir duopack-s28.
    declaredCardCount: null,
  },
  {
    /*
      Tin Box Hobby — canal magasins spécialisés. carddass.fr news.htm
      (15 nov) : 5 boosters S1–S5 + NI-PR16 + NI-PR11. Face catalogue =
      sleeve bleu reconstruit (curated/products/wrappers/tin-box-hobby.png) —
      même art « COFFRET MÉTAL » / Naruto scroll que le tin GD, fond bleu.
      Tin-box-hobby.jpg (contenu-tin-box : étui + tin + boosters) reste
      archival sous packshots/ ; ne pas le remonter en stagingFile sinon
      le plan paysage 400×232 bat le sleeve portrait au scorer.
      Distinct de tin-box Invocation 05129 (ne pas fusionner malgré l’art tin).
    */
    slug: "tin-box-hobby",
    kind: "coffret",
    category: "collector-boxes",
    setCode: null,
    name: "Tin Box Hobby",
    stagingFile: "tin-box-hobby.png",
    stagingKind: "wrappers",
    lang: "FR",
    // Total 42 (= 8×5 + 2) dans products-contents.
    declaredCardCount: null,
  },
  {
    slug: "display-s1-it",
    kind: "display",
    category: "displays",
    setCode: "s1",
    name: "Display Serie 1 — La Forza della Foglia",
    stagingFile: "display-s1-it.png",
    lang: "IT",
    declaredCardCount: null,
  },
  {
    slug: "starter-forza-della-foglia",
    kind: "deck",
    category: "decks",
    setCode: "s1",
    name: "Mazzo La Forza della Foglia",
    stagingFile: "starter-forza-della-foglia.png",
    lang: "IT",
    declaredCardCount: NARUTO_STARTER_CARD_COUNT,
  },
  {
    slug: "booster-s1-it",
    kind: "booster",
    category: "boosters",
    setCode: "s1",
    name: "Booster Serie 1 — La Forza della Foglia",
    stagingFile: "booster-s1-it.png",
    lang: "IT",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
  },
  {
    slug: "display-s2-it",
    kind: "display",
    category: "displays",
    setCode: "s2",
    name: "Display Serie 2 — Le Spire del Serpente",
    stagingFile: "display-s2-it.png",
    lang: "IT",
    declaredCardCount: null,
  },
  {
    slug: "booster-s2-it",
    kind: "booster",
    category: "boosters",
    setCode: "s2",
    name: "Booster Serie 2 — Le Spire del Serpente",
    stagingFile: "booster-s2-it.png",
    lang: "IT",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
  },
  {
    slug: "booster-s3-it",
    kind: "booster",
    category: "boosters",
    setCode: "s3",
    name: "Booster Serie 3 — La Maledizione della Sabbia",
    stagingFile: "booster-s3-it.png",
    lang: "IT",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
  },
  {
    /*
      Carddass Serie 3 castellano — Sunny Store paste (≠ Storm 3 CCG s28).
      Face: « SOBRE DE 8 CARTAS » + « INCLUYE UNA CARTA HOLOGRÁFICA ».
      Verso: Ref. 93114, EAN 3296580931149, BANDAI 2007 FABRICADO EN BELGICA,
      BANDAI ESPAÑA. Famille Amigo EU (même math 8 que FR/IT/DE).
    */
    slug: "booster-s3-es",
    kind: "booster",
    category: "boosters",
    setCode: "s3",
    name: "Booster Série 3",
    stagingFile: "",
    lang: "ES",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
    attested: true,
  },
  {
    /*
      S5 IT starters — Emporio di Milo shop photos (Ref. 93176).
      Tradimento (Sasuke) + Lealtà (Naruto) = the two Serie 5 mazzi.
    */
    slug: "starter-tradimento",
    kind: "deck",
    category: "decks",
    setCode: "s5",
    name: "Mazzo Tradimento — L'Eredità del Sogno",
    stagingFile: "",
    lang: "IT",
    declaredCardCount: NARUTO_STARTER_CARD_COUNT,
    attested: true,
  },
  {
    slug: "starter-lealta",
    kind: "deck",
    category: "decks",
    setCode: "s5",
    name: "Mazzo Lealtà — L'Eredità del Sogno",
    stagingFile: "",
    lang: "IT",
    declaredCardCount: NARUTO_STARTER_CARD_COUNT,
    attested: true,
  },
  {
    slug: "starter-il-fascino-del-male",
    kind: "deck",
    category: "decks",
    setCode: "s6",
    name: "Mazzo Il Fascino del Male",
    stagingFile: "starter-il-fascino-del-male.jpg",
    lang: "IT",
    declaredCardCount: NARUTO_STARTER_CARD_COUNT,
  },
  {
    /*
      Bustina IT Rivalità Eterna — cardgameclub S6 404 ; packshot eBay
      Empoli (itm/265148225277). Vinted 9720460480 confirme le scellé IT.
      8 cartes = byKind Carddass FR/IT (pas US CCG 10).
    */
    slug: "booster-s6-it",
    kind: "booster",
    category: "boosters",
    setCode: "s6",
    name: "Booster Serie 6 — Rivalità Eterna",
    stagingFile: "",
    lang: "IT",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
    attested: true,
  },
  {
    slug: "booster-s7-it",
    kind: "booster",
    category: "boosters",
    setCode: "s7",
    name: "Booster Serie 7 — Sete di Potere",
    stagingFile: "",
    lang: "IT",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
    attested: true,
  },
  {
    slug: "booster-s8-it",
    kind: "booster",
    category: "boosters",
    setCode: "s8",
    name: "Booster Serie 8 — Il Vento del Cambiamento",
    stagingFile: "",
    lang: "IT",
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
    attested: true,
  },
  {
    slug: "booster-vol5-jp",
    kind: "booster",
    category: "boosters",
    setCode: "maki5",
    name: "Booster 巻ノ五 — 実力伯仲！予選死闘編",
    stagingFile: "booster-vol5-jp.jpg",
    lang: "JA",
    declaredCardCount: 6,
  },
  ...colekaEnCcgNewDisplays().map((row) => enCcgDisplay(row.set, row.title)),
  ...goatIngestPackshots().map((row) => enCcgDisplay(row.setCode, row.title)),
  ...bandaiFrUsDriveNewEnDisplays().map((row) => ({
    ...enCcgDisplay(row.set, row.title),
    // Drive album is the attestation; Coleka cover path is empty for s7–s12.
    stagingFile: "",
    attested: true as const,
  })),
  {
    /*
      EN CCG Sage's Legacy single pack — ToyWiz paste. Slug `-en` : le short
      `booster-s24` = FR EU (8 cartes), packshot EN en fallback tant qu'on n'a
      pas de photo FR (Collection Naruto ~13:10 atteste le sachet FR).
      Display EN = `display-s24` ; FR = `display-s24-fr`.
    */
    slug: "booster-s24-en",
    kind: "booster",
    category: "boosters",
    setCode: "s24",
    name: "Booster Série 24",
    stagingFile: "booster-s24.jpg",
    stagingKind: "toywiz",
    lang: "EN",
    declaredCardCount: 10,
    attested: true,
  },
  {
    /*
      FR CCG Sage's Legacy — attesté Collection Naruto (boosters filmés) +
      Coleka `_r15466` (120 faces FR). Math EU 8 cartes (Namco / Cardport DE).
      Packshot : ToyWiz EN en fallback (même fichier que booster-s24-en).
    */
    slug: "booster-s24",
    kind: "booster",
    category: "boosters",
    setCode: "s24",
    name: "Booster Série 24",
    stagingFile: "booster-s24.jpg",
    stagingKind: "toywiz",
    lang: "FR",
    declaredCardCount: 8,
    attested: true,
  },
  {
    /*
      Display FR Sage's Legacy — scellé FR attesté ligne tardive (forum + YT
      boosters/duopacks) ; boîte FR non packshotée. Visuel = cover Coleka EN
      (`display-s24`) en fallback. Math : 8 cartes EU × 24 sachets (compte
      boîte US sur la photo) ; DE Cardport = 30×8 quand on aura une boîte EU.
    */
    slug: "display-s24-fr",
    kind: "display",
    category: "displays",
    setCode: "s24",
    name: "Display Série 24",
    stagingFile: "s24.webp",
    stagingKind: "coleka-en-covers",
    lang: "FR",
    declaredCardCount: null,
    attested: true,
  },
  {
    /*
      EN CCG Emerging Alliance (s14) — ToyWiz paste. Highlight
      « Contains 10 cards per pack » ; UPC 045557235826. Display already
      `display-s14` (Coleka). Deux arts face sur la fiche : Sakura/Sai
      préféré ; Naruto/Yamato archivé (ingest false).
    */
    slug: "booster-s14",
    kind: "booster",
    category: "boosters",
    setCode: "s14",
    name: "Booster Série 14",
    stagingFile: "booster-s14.jpg",
    stagingKind: "toywiz",
    lang: "EN",
    declaredCardCount: 10,
    attested: true,
  },
  {
    /*
      EN CCG Ultimate Ninja Storm 3 single pack — Sunny Store USA paste
      (face+verso). Verso: 10 cards (6C/2U/1R/1 special insert) ; UPC
      045557236489 ; MADE IN SINGAPORE ; Bandai America © 2013.
      ToyWiz thumb kept archival (ingest false). Slug `-en` : `booster-s28`
      = FR EU 8. Display catalogue `display-s28` (EN 24×10).
    */
    slug: "booster-s28-en",
    kind: "booster",
    category: "boosters",
    setCode: "s28",
    name: "Booster Série 28",
    stagingFile: "",
    lang: "EN",
    declaredCardCount: 10,
    attested: true,
  },
  {
    /*
      EN CCG Dream Legacy (s5) — Sunny Store paste. Slug `-en` : `booster-s5`
      est déjà le Carddass FR. Verso : « 9 randomly selected cards
      (6 common, 2 uncommon, 1 rare) » + Parallel 1:1 / Gold Foil 1:6.
      Boutique « 10 cartas » rejetée — l'imprimé du sachet gagne.
      UPC 045557145996 ; Bandai America 2007 MADE IN CHINA. Art Tsunade.
    */
    slug: "booster-s5-en",
    kind: "booster",
    category: "boosters",
    setCode: "s5",
    name: "Booster Série 5",
    stagingFile: "",
    lang: "EN",
    declaredCardCount: 9,
    attested: true,
  },
  {
    /*
      EN CCG Tournament Pack 3 (chibi) — Sunny Store paste.
      Verso: « EACH … PACK INCLUDES: 10 randomly selected cards
      (6 common, 2 uncommon, 1 rare, and 1 special insert …) ».
      UPC 045557236182 ; Bandai America 2011 MADE IN CHINA.
      Photo display Item #23818 archivée (ingest false) — pas de SKU display.
    */
    slug: "booster-tp3",
    kind: "booster",
    category: "boosters",
    setCode: "tp3",
    name: "Booster Tournament Pack 3 (Chibi)",
    stagingFile: "",
    lang: "EN",
    declaredCardCount: 10,
    attested: true,
  },
  {
    /*
      FR CCG Ultimate Ninja Storm 3 single booster — Sunny Store paste.
      Face imprime « 8 CARTES » ; verso EAN 3391891969925 (≠ duopack
      3391891970488). Display catalogue reste EN (`display-s28`).
    */
    slug: "booster-s28",
    kind: "booster",
    category: "boosters",
    setCode: "s28",
    name: "Booster Série 28",
    stagingFile: "",
    lang: "FR",
    declaredCardCount: 8,
    attested: true,
  },
  {
    slug: "display-s28",
    kind: "display",
    category: "displays",
    setCode: "s28",
    name: "Display Série 28",
    stagingFile: "set-cover.webp",
    stagingKind: "coleka-s28",
    lang: "EN",
    declaredCardCount: null,
  },
  {
    /*
      Display FR Storm 3 — eBay itm/285342890666 (vendu). Face FR + bas
      BANDAI 2013 MADE IN ITALY / Namco Bandai Games Europe Cergy ; flanc
      EAN 3391891969949 + « 120 cartes ». ≠ display-s28 EN (24×10 US).
      Nombre de sachets : titre vendeur « 24 BOOSTER » — pas imprimé sur
      les photos staged ; packsContained pas garanti ici.
    */
    slug: "display-s28-fr",
    kind: "display",
    category: "displays",
    setCode: "s28",
    name: "Display Série 28",
    stagingFile: "",
    lang: "FR",
    declaredCardCount: null,
    attested: true,
  },
  {
    /*
      Deck spécial Bandai USA CCG FR (Rampage Tornado / La tempête approche).
      33 reprints listés sur Coleka `_r16963` — pas le dump Approaching Wind
      (`s11`). Checklist = set `tempete`. Contenu exact attesté en staging
      (`coleka-rampage-tornado/cards.json`) ; les singles FR (titres + faces)
      sont ingestés via le scrape Coleka. `contentsKnown` reste false tant que
      l'ingest sealed n'attache pas encore `guaranteedPrints` depuis ce ledger.
    */
    slug: "deck-la-tempete-approche",
    kind: "deck",
    category: "decks",
    setCode: "tempete",
    name: "Deck Spécial — La tempête approche (Rampage Tornado)",
    stagingFile: "set-cover.webp",
    stagingKind: "coleka-rampage-tornado",
    lang: "FR",
    declaredCardCount: 33,
    attested: true,
  },
  {
    /*
      Blister retail FR : 2 sachets EU (8 cartes = 7+1 spéciale, verso Kinkai)
      + promo fenêtre PR-096 (4e Hokage). Pas Day One (PR-095). Packshot eBay
      face + Kinkai verso (EAN 3391891970488, BANDAI 2013 MADE IN ITALY).
      Math EU (≠ US 10×24) : sealed-contents + dig eu-ccg-pack-math.
      `coffret` + mixed_bundle : promo fixe, sachets aléatoires.
    */
    slug: "duopack-s28",
    kind: "coffret",
    category: "boosters-blister",
    setCode: "s28",
    name: "Duopack Série 28 — Ultimate Ninja Storm 3 (2 boosters + PR-096)",
    stagingFile: "",
    lang: "FR",
    // Total 17 (= 8+8+1) vit dans sealed-contents — pas ici : `resolveSealedContents`
    // prendrait 17 pour cardsPerPack sur un `coffret`.
    declaredCardCount: null,
    attested: true,
  },
];

/** Series logos (not SKUs). S5 sommaire is the readable one (217×83). */
export const NARUTO_SET_LOGOS: Readonly<Record<string, string>> = {
  s1: "logos_series/logo_s1.gif",
  s2: "logos_series/logo_s2.gif",
  s3: "logos_series/logo_s3.gif",
  s4: "logos_series/logo_s4.gif",
  s5: "logos_series/LOGO-S5-sommaire.gif",
};

function enCcgDisplay(set: string, _title: string): NarutoSealedSpec {
  const n = set.replace(/^s/, "");
  return {
    slug: `display-${set}`,
    kind: "display",
    category: "displays",
    setCode: set,
    // Titre US (Emerging Alliance…) reste sur l'extension ; le scellé aligne
    // le libellé FR/IT/DE pour les conseils multilingues + drapeau.
    name: `Display Série ${n}`,
    stagingFile: `${set}.webp`,
    stagingKind: "coleka-en-covers",
    lang: "EN",
    declaredCardCount: null,
  };
}

function booster(set: string, file: string): NarutoSealedSpec {
  const n = set.replace(/^s/, "");
  return {
    slug: `booster-${set}`,
    kind: "booster",
    category: "boosters",
    setCode: set,
    name: `Booster Série ${n}`,
    stagingFile: file,
    declaredCardCount: NARUTO_BOOSTER_CARD_COUNT,
  };
}

function starter(
  set: string,
  slug: string,
  name: string,
  file: string,
): NarutoSealedSpec {
  return {
    slug: `starter-${slug}`,
    kind: "deck",
    category: "decks",
    setCode: set,
    name,
    stagingFile: file,
    declaredCardCount: NARUTO_STARTER_CARD_COUNT,
  };
}

type ProductDump = {
  source: NarutoProductSource;
  src: string;
  stagingRel: string;
};

const COLEKA_COVER_EXTS = [".webp", ".jpg", ".png"] as const;

function shopPackshotRows(): readonly { slug: string; staging: string }[] {
  const rows = [
    ...cardgameclubIngestPackshots(),
    ...martinaIngestPackshots(),
    ...emporiodimiloIngestPackshots(),
    ...vintedIngestPackshots(),
    ...leboncoinIngestPackshots(),
    ...kinkaiIngestPackshots(),
    ...sunnystoreIngestPackshots(),
    ...gradedcardcenterIngestPackshots(),
    ...psYoyakuIngestPackshots(),
    ...trictracIngestPackshots(),
    ...vialudibundaIngestPackshots(),
    ...ebayIngestPackshots(),
    ...rakutenIngestPackshots(),
    ...mangaNewsIngestPackshots(),
    ...mangaSanctuaryIngestPackshots(),
    ...goatIngestPackshots(),
    ...bandaiFrUsDriveIngestPackshots(),
    ...scifiUniverseIngestPackshots(),
    ...toywizIngestPackshots(),
    ...atomicempireIngestPackshots(),
  ];
  const out: { slug: string; staging: string }[] = [];
  for (const row of rows) {
    const slug = "slug" in row ? row.slug : null;
    const staging = "staging" in row ? row.staging : null;
    if (typeof slug === "string" && slug.trim() && typeof staging === "string") {
      out.push({ slug, staging });
    }
  }
  return out;
}

/** Un visuel fait main, sous `curated/products/`. */
function curatedDumpIfPresent(...parts: string[]): ProductDump | null {
  const src = path.join(narutoCuratedProductsDir(), ...parts);
  if (!existsSync(src) || !statSync(src).isFile()) return null;
  const source = productSourceFromCuratedFolder(parts[0] ?? "");
  if (!source) return null;
  return {
    source,
    src,
    stagingRel: path.join("curated", "products", ...parts),
  };
}

function dumpIfPresent(
  packRoot: string,
  stagingRel: string,
): ProductDump | null {
  // Un spec attesté n'a pas de fichier : `path.join(root, "")` rendrait la
  // racine du pack, qui existe — et on copierait un dossier.
  if (!stagingRel) return null;
  const src = path.join(packRoot, stagingRel);
  if (!existsSync(src) || !statSync(src).isFile()) return null;
  const source = productSourceFromStagingRel(stagingRel);
  if (!source) return null;
  return { source, src, stagingRel };
}

/**
 * Les specs écrits à la main, plus les sorties japonaises tirées du relevé curé.
 *
 * Le catalogue portait **2 SKU japonais** pour une ligne de dix-sept volumes.
 * `cardcheckbox-jp.json` en recense trente ; elles n'entraient pas parce que
 * l'ingest saute tout SKU sans packshot, pas parce qu'on les ignorait.
 *
 * Un spec écrit à la main gagne toujours sur son homonyme dérivé : `booster-vol5-jp`
 * a un packshot, un nom composé et une taille de sachet vérifiée — la ligne
 * dérivée ne saurait dire que le numéro du volume.
 */
export function narutoSealedSpecs(): NarutoSealedSpec[] {
  const out = [...NARUTO_SEALED_SKUS];
  const held = new Set(out.map((spec) => spec.slug));
  for (const release of volumeOfficialProducts()) {
    if (held.has(release.slug)) continue;
    held.add(release.slug);
    out.push({
      slug: release.slug,
      kind: release.kind,
      category: release.category,
      setCode: release.setCode,
      name: release.name,
      stagingFile: release.stagingFile,
      stagingKind: "carddass-official",
      lang: release.lang,
      declaredCardCount: null,
      released: release.released,
      attested: true,
    });
  }
  for (const release of germanSealedReleases()) {
    if (held.has(release.slug)) continue;
    held.add(release.slug);
    out.push({
      slug: release.slug,
      kind: release.kind,
      category: release.category,
      setCode: release.setCode,
      name: release.name,
      stagingFile: release.stagingFile,
      stagingKind: "comicplanet-de",
      lang: release.lang,
      declaredCardCount: null,
      attested: true,
    });
  }
  /*
    Les dix-neuf SKU du 疾風伝 s'écrivaient ici, dans l'index scellé du
    Carddass — un autre jeu. Ils sont partis avec lui le 2026-08-21 ; c'est le
    pack `naruto/shippuden` qui les porte, et son propre relevé les produit.
  */
  for (const release of japaneseSealedReleases()) {
    if (held.has(release.slug)) continue;
    held.add(release.slug);
    out.push({
      slug: release.slug,
      kind: release.kind,
      category: release.category,
      setCode: release.setCode,
      name: release.name,
      // Vide sauf quand Bandai publie encore le visuel : c'est l'objet de
      // `attested` de laisser entrer une sortie sans image.
      stagingFile: release.stagingFile ?? "",
      ...(release.stagingFile && release.stagingKind
        ? { stagingKind: release.stagingKind }
        : {}),
      lang: release.lang,
      declaredCardCount: release.declaredCardCount,
      setKinds: release.setKinds,
      released: release.released,
      attested: true,
    });
  }
  return out;
}

function collectSpecArtDumps(
  packRoot: string,
  spec: NarutoSealedSpec,
): ProductDump[] {
  if (spec.stagingKind === "coleka-en-covers") {
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "coleka-en-covers", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "toywiz") {
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "toywiz", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "atomicempire") {
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "atomicempire", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "tv-tokyo") {
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "tv-tokyo", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "jp-boosters") {
    const hit = curatedDumpIfPresent("jp-boosters", spec.stagingFile);
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "wrappers") {
    const hit = curatedDumpIfPresent("wrappers", spec.stagingFile);
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "suruga-kaitori") {
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "suruga-kaitori", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "comicplanet-de") {
    /*
      La retouche curée passe avant la moisson. La série 7 est servie mal
      cadrée — 1600×1200 avec le sachet perdu dans un grand vide — et son
      recadrage est fait main : il vit donc dans `curated/`, sans quoi la
      prochaine moisson le remplacerait par l'original sans un bruit.
    */
    const curated = curatedDumpIfPresent("comicplanet-de", spec.stagingFile);
    if (curated) return [curated];
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "comicplanet-de", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "carddass-official") {
    const hit = dumpIfPresent(
      packRoot,
      path.join("staging", "carddass-official", spec.stagingFile),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "carddas-jp") {
    /*
      Le miroir garde l'arborescence du site sous son hôte, si bien que le
      chemin est long : c'est la copie conforme de carddas.com, pas un dossier
      à plat comme les autres moissons.
    */
    const hit = dumpIfPresent(
      packRoot,
      path.join(
        "staging",
        "carddas-jp",
        "www.carddas.com",
        "naruto",
        spec.stagingFile,
      ),
    );
    return hit ? [hit] : [];
  }
  if (spec.stagingKind === "coleka-s28") {
    for (const ext of COLEKA_COVER_EXTS) {
      const hit = dumpIfPresent(
        packRoot,
        path.join("staging", "coleka-s28", `set-cover${ext}`),
      );
      if (hit) return [hit];
    }
    return [];
  }
  if (spec.stagingKind === "coleka-rampage-tornado") {
    for (const ext of COLEKA_COVER_EXTS) {
      const hit = dumpIfPresent(
        packRoot,
        path.join("staging", "coleka-rampage-tornado", `set-cover${ext}`),
      );
      if (hit) return [hit];
    }
    return [];
  }
  const hit = dumpIfPresent(
    packRoot,
    path.join(NARUTO_STAGING_SITE, "images", "packshots", spec.stagingFile),
  );
  return hit ? [hit] : [];
}

function collectArtDumps(
  packRoot: string,
  spec: NarutoSealedSpec,
): ProductDump[] {
  const bySource = new Map<NarutoProductSource, ProductDump>();
  for (const dump of collectSpecArtDumps(packRoot, spec)) {
    bySource.set(dump.source, dump);
  }
  for (const row of shopPackshotRows()) {
    if (row.slug !== spec.slug) continue;
    const hit = dumpIfPresent(packRoot, row.staging);
    if (hit) bySource.set(hit.source, hit);
  }
  return [...bySource.values()];
}

function collectBackDumps(
  packRoot: string,
  spec: NarutoSealedSpec,
): ProductDump[] {
  const bySource = new Map<NarutoProductSource, ProductDump>();
  if (spec.stagingBackFile) {
    // Un dos d'emballage est toujours une photo choisie à la main.
    const hit = curatedDumpIfPresent("wrappers", spec.stagingBackFile);
    if (hit) bySource.set(hit.source, hit);
  }
  for (const row of vintedIngestBacks()) {
    if (row.slug !== spec.slug) continue;
    const hit = dumpIfPresent(packRoot, row.staging);
    if (hit) bySource.set(hit.source, hit);
  }
  for (const row of leboncoinIngestBacks()) {
    if (row.slug !== spec.slug) continue;
    const hit = dumpIfPresent(packRoot, row.staging);
    if (hit) bySource.set(hit.source, hit);
  }
  for (const row of kinkaiIngestBacks()) {
    if (row.slug !== spec.slug) continue;
    const hit = dumpIfPresent(packRoot, row.staging);
    if (hit) bySource.set(hit.source, hit);
  }
  for (const row of sunnystoreIngestBacks()) {
    if (row.slug !== spec.slug) continue;
    const hit = dumpIfPresent(packRoot, row.staging);
    if (hit) bySource.set(hit.source, hit);
  }
  return [...bySource.values()];
}

/** Les seize séries anglaises, qui partagent le wordmark Shippuden CCG. */
const EN_CCG_LOGO_SETS = new Set(
  Array.from({ length: 16 }, (_, i) => `s${i + 13}`),
);

/**
 * Le badge d'une série, dans sa langue si elle en a un, sinon dans une autre.
 *
 * L'ordre de repli n'est pas un classement de qualité : c'est celui des
 * langues qui ont effectivement des badges découpés — le français couvre les
 * séries 1 à 5, l'allemand les 6 à 9. Ensemble ils couvrent toute la ligne.
 */
function curatedSeriesBadge(lang: string, set: string): ProductDump | null {
  for (const folder of [lang, "fr", "de"]) {
    const hit = curatedDumpIfPresent("series-badges", folder, `${set}.png`);
    if (hit) return hit;
  }
  return null;
}

function collectLogoDumps(
  packRoot: string,
  spec: NarutoSealedSpec,
): ProductDump[] {
  const bySource = new Map<NarutoProductSource, ProductDump>();
  const set = spec.setCode;
  const lang = narutoProductLangFolder(spec.lang ?? "FR");

  /*
    Les badges de série, découpés sur les sachets. Ils existent par langue —
    le français écrit « SÉRIE 4 » avec l'accent, l'allemand « SERIE 4 » sans —
    mais un badge est d'abord **le numéro de la série**, et ce numéro se lit
    pareil partout. Un accent qui diffère ne vaut pas de laisser un SKU sans
    logo : le badge de sa langue d'abord, celui d'une autre langue ensuite.

    Sans ce repli, treize SKU restaient nus — les séries 1 à 5 en allemand et
    en italien, la 6 en italien — alors que le badge existait à côté.
  */
  if (set) {
    const badge = curatedSeriesBadge(lang, set);
    if (badge) bySource.set(badge.source, badge);
  }

  /*
    Les `logos_series` de carddass.fr. Français d'origine, servis quelle que
    soit la langue pour la même raison : 100×39 contre 224×88, ils ne passent
    devant un badge nulle part, mais ils valent mieux que rien là où aucun
    badge n'a été découpé.
  */
  if (set && NARUTO_SET_LOGOS[set]) {
    const hit = dumpIfPresent(
      packRoot,
      path.join(
        NARUTO_STAGING_SITE,
        "images",
        "packshots",
        NARUTO_SET_LOGOS[set],
      ),
    );
    if (hit) bySource.set(hit.source, hit);
  }
  /*
    Les couvertures Coleka et Goat servaient aussi de logo, et le résultat
    était un faux : sur les seize displays anglais, le « logo » était la
    **photo du display elle-même**, octet pour octet. Un doublon renseigne
    moins que rien, puisqu'il se fait passer pour une information.

    Ce qui suit est un vrai logo : le wordmark
    « SHONEN JUMP NARUTO SHIPPUDEN COLLECTIBLE CARD GAME », 877×447 sur fond
    blanc. Il est **commun aux seize séries anglaises** — et c'est légitime,
    puisque c'est le logo du jeu, pas celui d'une série. Rien à voir avec un
    produit qui se prend pour son propre logo.
  */
  if (set && EN_CCG_LOGO_SETS.has(set)) {
    const hit = curatedDumpIfPresent("ccg-logo", "naruto-shippuden-ccg.jpg");
    if (hit) bySource.set(hit.source, hit);
  }
  return [...bySource.values()];
}

function installDump(
  destDir: string,
  role: "art" | "back" | "logo",
  dump: ProductDump,
): string {
  const ext = path.extname(dump.src).replace(/^\./, "").toLowerCase() || "bin";
  const destName = narutoProductFilename(dump.source, role, ext);
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(destDir)) {
    const parsed = narutoProductFileOf(name);
    if (
      parsed?.role === role &&
      parsed.source === dump.source &&
      name !== destName
    ) {
      unlinkSync(path.join(destDir, name));
    }
  }
  copyFileSync(dump.src, path.join(destDir, destName));
  return destName;
}

async function promoteProductRole(
  destDir: string,
  lang: string,
  role: "art" | "back" | "logo",
  sharp: typeof import("sharp").default,
): Promise<string | null> {
  if (!existsSync(destDir)) return null;
  const stored: NarutoProductStoredFace[] = [];
  for (const name of readdirSync(destDir)) {
    const parsed = narutoProductFileOf(name);
    if (parsed?.role !== role) continue;
    try {
      const meta = await sharp(path.join(destDir, name)).metadata();
      stored.push({
        source: parsed.source,
        file: name,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    } catch {
      stored.push({
        source: parsed.source,
        file: name,
        width: 0,
        height: 0,
      });
    }
  }
  const best = pickBestNarutoProductDump(stored, lang);
  if (!best) return null;
  const winner = stored.find((face) => face.source === best);
  const filename = winner?.file ?? narutoProductFilename(best, role);
  recordNarutoProductDecision(destDir, role, filename);
  return filename;
}

/**
 * Retire les faces qu'aucune source ne réclame plus.
 *
 * `installDump` n'élaguait que la même source sous une autre extension. Une
 * source **retirée** laissait donc son fichier sur le disque, et il pouvait
 * continuer à gagner : le 巻ノ四 servait encore la planche de six cartes de la
 * base produit, en 560×560, longtemps après qu'on lui eut préféré le sachet.
 * Le choix se fait aux pixels, alors un fichier périmé et grand bat toujours
 * un fichier juste et petit.
 *
 * L'élagage n'a lieu **que si le rôle a au moins une prise fraîche**. Sans ce
 * garde-fou, un staging absent — checkout partiel, moisson non rejouée — se
 * lirait comme « plus aucune source » et effacerait des visuels valides.
 */
function pruneUnclaimedRole(
  destDir: string,
  role: "art" | "back" | "logo",
  dumps: readonly ProductDump[],
): void {
  if (!dumps.length || !existsSync(destDir)) return;
  const claimed = new Set(dumps.map((dump) => dump.source));
  for (const name of readdirSync(destDir)) {
    const parsed = narutoProductFileOf(name);
    if (!parsed || parsed.role !== role) continue;
    if (claimed.has(parsed.source)) continue;
    unlinkSync(path.join(destDir, name));
  }
}

function removeLegacyFlatProductFiles(destDir: string): void {
  if (!existsSync(destDir)) return;
  for (const name of readdirSync(destDir)) {
    const abs = path.join(destDir, name);
    if (!statSync(abs).isFile()) continue;
    unlinkSync(abs);
  }
}

/**
 * Ingère une ligne scellée : specs → `products/` + `products-index.json`.
 *
 * Exporté depuis le 2026-08-21 pour le pack `naruto/shippuden`. Les deux jeux
 * Naruto partagent la **disposition du staging** — les mêmes dossiers, les
 * mêmes rôles art/back/logo, les mêmes règles de promotion — parce qu'ils
 * viennent de la même moisson. Cette fonction ne connaît que ça ; le jeu, il
 * est tout entier dans les specs qu'on lui passe.
 *
 * Elle n'est pas montée dans `providers/shared/` parce qu'elle n'est pas
 * commune à tous les jeux : son vocabulaire de staging (`carddas-jp`,
 * `coleka-s28`, `comicplanet-de`) est celui de la famille Naruto.
 */
export async function ingestSealedLine(opts: {
  packId: string;
  packRoot: string;
  specs: readonly NarutoSealedSpec[];
}): Promise<{
  pack: string;
  written: number;
  skipped: number;
  file: string;
}> {
  const destRoot = path.join(opts.packRoot, "products");
  mkdirSync(destRoot, { recursive: true });
  const { default: sharp } = await import("sharp");

  const index = emptyProductsIndex(opts.packId);
  let skipped = 0;
  for (const spec of opts.specs) {
    const lang = narutoProductLangFolder(spec.lang ?? "FR");
    const destDir = path.join(destRoot, spec.slug, lang);
    const artDumps = collectArtDumps(opts.packRoot, spec);
    if (!artDumps.length && !spec.attested) {
      skipped += 1;
      continue;
    }
    for (const dump of artDumps) installDump(destDir, "art", dump);
    pruneUnclaimedRole(destDir, "art", artDumps);
    const logoDumps = collectLogoDumps(opts.packRoot, spec);
    for (const dump of logoDumps) installDump(destDir, "logo", dump);
    pruneUnclaimedRole(destDir, "logo", logoDumps);
    const artFile = await promoteProductRole(destDir, lang, "art", sharp);
    if (!artFile && !spec.attested) {
      skipped += 1;
      continue;
    }
    const backDumps = collectBackDumps(opts.packRoot, spec);
    for (const dump of backDumps) installDump(destDir, "back", dump);
    pruneUnclaimedRole(destDir, "back", backDumps);
    const backFile = await promoteProductRole(destDir, lang, "back", sharp);
    const logoFile = await promoteProductRole(destDir, lang, "logo", sharp);
    const artDump = artFile
      ? artDumps.find(
          (dump) => narutoProductFileOf(artFile)?.source === dump.source,
        )
      : undefined;
    const contents = resolveSealedContents({
      kind: spec.kind,
      name: spec.name,
      slug: spec.slug,
      declaredCardCount: spec.declaredCardCount,
    });
    const behavior = sealedBehaviorForKind(spec.kind);
    const layers = resolveContentLayers({
      kind: spec.kind,
      behavior,
      prints: [],
      contentsKnown: false,
      containsPrintsIsPreview: false,
    });
    const entry: SealedProductEntry = {
      slug: spec.slug,
      path: artDump?.stagingRel ?? artFile ?? "",
      kind: spec.kind,
      behavior,
      category: spec.category,
      name: spec.name,
      image: artFile
        ? assetsPackFileUrl(opts.packId, "products", spec.slug, lang, artFile)
        : null,
      imageBack: backFile
        ? assetsPackFileUrl(opts.packId, "products", spec.slug, lang, backFile)
        : null,
      setLogo: logoFile
        ? assetsPackFileUrl(opts.packId, "products", spec.slug, lang, logoFile)
        : null,
      setCardCount: spec.setKinds ?? null,
      setCode: spec.setCode,
      lang: spec.lang ?? "FR",
      releaseDate: spec.released ?? null,
      priceCents: null,
      cardsPerPack: contents.cardsPerPack,
      packsContained: contents.packsContained,
      guaranteedPrints: layers.guaranteedPrints,
      randomPoolScope: layers.randomPoolScope,
      randomPoolPrints: layers.randomPoolPrints,
      declaredCardCount: spec.declaredCardCount,
      contentsKnown: false,
      containsPrintsIsPreview: false,
      prints: [],
    };
    index.products[sealedProductKey(opts.packId, spec.slug)] = entry;
  }

  removeLegacyFlatProductFiles(destRoot);
  const file = path.join(opts.packRoot, "products-index.json");
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return {
    pack: opts.packId,
    written: Object.keys(index.products).length,
    skipped,
    file,
  };
}

export async function ingestNarutoSealedProducts(opts?: {
  packRoot?: string;
  /** @deprecated Same root as `packRoot` — EN SKUs live on Carddass. */
  enPackRoot?: string;
}): Promise<{
  pack: string;
  written: number;
  skipped: number;
  file: string;
}> {
  const packRoot =
    opts?.packRoot ?? opts?.enPackRoot ?? path.join(dataRoot(), NARUTO_PACK_ID);
  installProviderProductsContents(
    NARUTO_PACK_ID,
    path.join(narutoCuratedDir(), "products-contents.json"),
  );
  return ingestSealedLine({
    packId: NARUTO_PACK_ID,
    packRoot,
    specs: narutoSealedSpecs(),
  });
}
