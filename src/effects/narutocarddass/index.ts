/**
 * Naruto Carddass effect pack — card back, house foil, and sealed-bag demos.
 *
 * Catalogue-only (no APK / Unity dump). House CSS foil approximates holos; the
 * playroom also tiles a generic sealed bag (`sealed` / `foil-sealed`) and
 * adaptive 9-slice demos (`*-adaptive`) so we can inspect packaging without a
 * Live capture.
 */
import { defineCatalogueOnlyPack } from "@/effects/defineCatalogueOnlyPack";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";

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

/**
 * Playroom tiles (not Unity materials).
 * - `sealed` → packaging only (9-slice, same as shelves)
 * - `foil-sealed` → finish `holo` + bag
 * - `*-full` → legacy full-bleed PNG for A/B
 */
export const NARUTO_CARDDASS_PLAYROOM_MATERIALS = [
  "holo",
  "foil-sealed",
  "foil-sealed-full",
  "sealed",
  "sealed-full",
] as const;

/** Finish names this pack renders as foil, lower-cased as they are stored. */
export const NARUTO_CARDDASS_FINISHES = Object.keys(FINISH_SHADER);
export const NARUTO_CCG_FINISHES = NARUTO_CARDDASS_FINISHES;

/** Demo face for the foils / bag playroom (S1 FR NI-019). */
const PLAYROOM_DEMO_ART =
  `${ASSET_BASE}/cards/ninja/ni0019/fr/art.carddass.jpg`;

function playroomArtForMaterial(name: string): PlayroomArt | null {
  const n = name.trim().toLowerCase();
  if (n === "holo") {
    return {
      imageUrl: PLAYROOM_DEMO_ART,
      maskUrl: NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
      label: "Holofoil (générique)",
    };
  }
  if (n === "foil-sealed" || n === "foil-sealed-full") {
    return {
      imageUrl: PLAYROOM_DEMO_ART,
      maskUrl: NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
      label: n.endsWith("-full") ? "Foil + sachet (full)" : "Foil + sachet",
    };
  }
  if (n === "sealed" || n === "sealed-full") {
    return {
      imageUrl: PLAYROOM_DEMO_ART,
      label: n.endsWith("-full") ? "Sachet (full)" : "Sachet",
    };
  }
  return null;
}

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

/*
  Même découpe que `narutoCatalogueLineForCard` (packs.ts) — dupliquée ici pour
  que le registry effects reste autonome. Le skeleton grille n'accepte que les
  dos pack/set : sans resolve set-scope, Storm 3 / Legacy retombaient sur le
  verso Carddass FR pendant le chargement (le stamp print `back.en` est filtré).
*/
const CARDDASS_PRINTED_PREFIX =
  /^(ni|te|ta|cl|ki|prni|prte|prta|prcl|prki|opni)[-]?\d/i;
const EN_CCG_PRINTED_PREFIX =
  /^(nus|jus|mus|cus|prus|n|j|m|c|pr|ps)[-]?\d/i;
const DATA_CARDDASS_PRINTED_PREFIX = /^(dn|nm|nx)[-]?\d/i;

function isEnCcgPrintedRef(card: string, setCode: string): boolean {
  const raw = card.trim();
  if (DATA_CARDDASS_PRINTED_PREFIX.test(raw)) return false;
  if (CARDDASS_PRINTED_PREFIX.test(raw)) return false;
  if (EN_CCG_PRINTED_PREFIX.test(raw)) return true;
  const series = setCode.trim().toLowerCase();
  if (!series) return false;
  if (/^maki\d+$/.test(series)) return false;
  // s7–s28 / TP / tin — ligne USA (Storm 3, Sage's Legacy, …)
  return (
    /^s(?:[7-9]|1\d|2[0-8])$/.test(series) ||
    /^tp\d+$/.test(series) ||
    /^tin\d+$/.test(series)
  );
}

const pack = defineCatalogueOnlyPack({
  id: NARUTO_CARDDASS_EFFECT_PACK_ID,
  label: "Naruto Carddass",
  blurb: "Catalogue local — foil maison + sachets (playroom)",
  assetBase: ASSET_BASE,
  /** Flip default = Carddass FR sleeve (`curated/cards/back.fr.png`). */
  cardBackUrl: `${ASSET_BASE}/cards/back.fr.webp`,
  /*
    Les 313 cartes du 疾風伝 montraient le dos Carddass : les dos sont servis
    par **langue**, et cette ligne est japonaise, donc elle héritait de
    `back.ja.webp`. Deux jeux différents ne partagent pas un dos.

    La ligne USA (Legacy / Storm 3 / s7–s28) partage un verso unique
    (`back.en.webp`). Il doit être **set-scope** pour le skeleton grille —
    le stamp print seul est ignoré par `resolveSharedCardBackSkeleton`.
  */
  resolveCardBack: ({ setCode, printKey }) => {
    const card = (printKey ?? "").split(":").pop() ?? "";
    const set = (setCode ?? "").trim();
    if (SHIPPUDEN_JA_FAMILIES.test(card) || SHIPPUDEN_JA_SETS.test(set)) {
      return SHIPPUDEN_JA_BACK_URL;
    }
    if (isEnCcgPrintedRef(card, set)) {
      return NARUTO_CCG_SLEEVE_BACK_URL;
    }
    return null;
  },
  finishShader: FINISH_SHADER,
  listHouseFinishesAsMaterials: true,
  fallbackFoilMaskUrl: NARUTO_CARDDASS_FULL_FOIL_MASK_URL,
  playroomArtForMaterial,
  resolveCss: (finish) => {
    const key = (finish ?? "").trim().toLowerCase();
    // Packaging-only finish — foil+bag demos use finish `holo` instead.
    if (
      key === "sealed" ||
      key === "sealed-top" ||
      key === "sealed-both" ||
      key === "sealed-adaptive" ||
      key === "sealed-full"
    ) {
      return { finishShaderId: null, varnishShaderId: null };
    }
    const mapped = FINISH_SHADER[key] ?? null;
    return {
      finishShaderId: mapped,
      varnishShaderId: null,
    };
  },
});

pack.listMaterials = () => [...NARUTO_CARDDASS_PLAYROOM_MATERIALS];
pack.parseMaterialName = (name) => {
  const n = name.trim().toLowerCase();
  if (
    n === "sealed" ||
    n === "sealed-both" ||
    n === "sealed-top" ||
    n === "sealed-adaptive" ||
    n === "sealed-full"
  ) {
    return { finish: "sealed", varnish: null };
  }
  if (
    n === "foil-sealed" ||
    n === "foil-sealed-adaptive" ||
    n === "foil-sealed-full" ||
    n.endsWith("-sealed") ||
    n.endsWith("-sealed-adaptive") ||
    n.endsWith("-sealed-full")
  ) {
    return { finish: "holo", varnish: null };
  }
  if (n === "holo") return { finish: "holo", varnish: null };
  return { finish: null, varnish: null };
};

export const narutoCarddassEffectPack = pack;
export const narutoCcgEffectPack = narutoCarddassEffectPack;
export const narutoEnCcgEffectPack = narutoCarddassEffectPack;
