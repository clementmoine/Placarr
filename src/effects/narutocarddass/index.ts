/**
 * Naruto Carddass effect pack — card back, and a house look per finish.
 *
 * The pack is catalogue-only: no APK and no shader dump — that is what
 * `cataloguePacks.hasFoilEffects === false` still means. It is registered
 * because the card back resolves through the effect pack registry
 * (`resolveCardBackCandidates`), and without one a Naruto card had nothing to
 * flip to.
 *
 * What it does render is a *house* CSS look. Those are texture-free, so they
 * need no dump: an approximation is honest here because we know from the
 * catalogue which prints are foil (the rarity is the finish on this game), we
 * just do not have the captured layer. The alternative was showing a holo and
 * a common as the same flat scan.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";

/**
 * Id chosen to collide with nothing else quoted in the tree: the data-pack
 * path and the provider id are both mentioned legitimately elsewhere, and the
 * bare franchise word is a title-enrichment keyword. The blindness guards match
 * an id wrapped in quotes or backticks, so any of those three would flag a
 * innocent mention as a leak into core.
 */
export const NARUTO_CARDDASS_EFFECT_PACK_ID = "naruto-carddass";
export const NARUTO_CCG_EFFECT_PACK_ID = NARUTO_CARDDASS_EFFECT_PACK_ID;
/** @deprecated Same pack — CCG sleeve is `back.en.webp` on Carddass. */
export const NARUTO_EN_CCG_EFFECT_PACK_ID = NARUTO_CARDDASS_EFFECT_PACK_ID;

const ASSET_BASE = "/assets/naruto/carddass";

/**
 * Whole face shines: these cards have foil under the art, not a shaped layer.
 *
 * Providers stamp this on the candidate (as TCGdex does with the Pokémon one)
 * rather than leaning on `fallbackFoilMaskUrl`: the picker, the card tile and
 * the detail page all gate the foil layer on the *candidate* having a mask, so
 * a print without one renders flat before the pack fallback is ever consulted.
 */
export const NARUTO_CARDDASS_FULL_FOIL_MASK_URL = `${ASSET_BASE}/full_foil_mask.webp`;
export const NARUTO_CCG_FULL_FOIL_MASK_URL = NARUTO_CARDDASS_FULL_FOIL_MASK_URL;
/** USA CCG sleeve — FR Storm 3 uses this verso, not the Carddass back. */
export const NARUTO_CCG_SLEEVE_BACK_URL = `${ASSET_BASE}/cards/back.en.webp`;

/**
 * Finish → house shader. The house set is texture-free, so a pack with no
 * Unity dump can still catch the light; the Lorcana looks are unusable here
 * because they sample `/assets/lorcana/web/*.jpg`.
 *
 * One shiny finish, deliberately. The line has no reverse and no etch, and a
 * promo is a way a card was handed out, not a way it was printed — that stays
 * a fact on the card, not a finish. `etch` is left out too: it needs a
 * per-print mask we do not have.
 */
const FINISH_SHADER: Record<string, string> = {
  // A single band of white crossing the card. The spectrum look was busier
  // than anything we can actually claim about these scans: no foil was ever
  // captured for this pack, so a passing highlight says "shiny" without
  // inventing detail.
  holo: "flare",
};

/** Finish names this pack renders, lower-cased as they are stored. */
export const NARUTO_CARDDASS_FINISHES = Object.keys(FINISH_SHADER);
export const NARUTO_CCG_FINISHES = NARUTO_CARDDASS_FINISHES;

/**
 * Les quatre familles du 「NARUTO-ナルト- 疾風伝 カードゲーム」 (2007-2009).
 *
 * C'est **un autre jeu** que le Carddass, pas une extension : maquette
 * différente (sous-titre latin 忍 SHINOBI / 術 JUTSU / 作 SAKUSEN, gemmes
 * rondes), pied « BANDAI 2007 », référence en 忍伝-N, numérotation qui repart
 * de 1 — `ni0001` et `shi0001` sont tous deux うずまきナルト. Aucun set commun
 * avec le Carddass, dans les deux sens.
 *
 * À ne pas confondre avec le « Naruto Shippuden Collectible Card Game »
 * **anglais** (`s13`-`s28`), qui est encore autre chose : la suite de la
 * localisation américaine du Carddass, et qui garde le dos anglais.
 */
const SHIPPUDEN_JA_FAMILIES = /^(shi|mju|msa|gaku)\d/i;
/** Les actes 第一幕…第八幕 de cette ligne. */
const SHIPPUDEN_JA_SETS = /^(maku\d+|shi|mju|msa|gaku)$/i;

/**
 * Le dos de cette ligne — 「NARUTO 疾風伝 CARD GAME」 dans un losange, sans
 * rapport avec le triskèle 忍/術/幻 du Carddass.
 *
 * Un seul fichier pour les quatre familles, rangé sous `shi/` parce que
 * l'installeur de dos curés est indexé par dossier. C'est un dos **de ligne**,
 * pas de famille : les quatre le partagent.
 */
const SHIPPUDEN_JA_BACK_URL = `${ASSET_BASE}/cards/shi/back.webp`;

export const narutoCarddassEffectPack = defineCatalogueOnlyPack({
  id: NARUTO_CARDDASS_EFFECT_PACK_ID,
  label: "Naruto Carddass",
  blurb: "Catalogue local — dos de pack, sans effet foil",
  assetBase: ASSET_BASE,
  /** Flip default = Carddass FR sleeve (`curated/cards/back.fr.png`). */
  cardBackUrl: `${ASSET_BASE}/cards/back.fr.webp`,
  /*
    Les 313 cartes du 疾風伝 montraient le dos Carddass : les dos sont servis
    par **langue**, et cette ligne est japonaise, donc elle héritait de
    `back.ja.webp`. Deux jeux différents ne partagent pas un dos.
  */
  resolveCardBack: ({ setCode, printKey }) => {
    const card = (printKey ?? "").split(":").pop() ?? "";
    const set = (setCode ?? "").trim();
    return SHIPPUDEN_JA_FAMILIES.test(card) || SHIPPUDEN_JA_SETS.test(set)
      ? SHIPPUDEN_JA_BACK_URL
      : null;
  },
  finishShader: FINISH_SHADER,
  fallbackFoilMaskUrl: NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
});

export const narutoCcgEffectPack = narutoCarddassEffectPack;
export const narutoEnCcgEffectPack = narutoCarddassEffectPack;
