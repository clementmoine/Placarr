/**
 * Admin Catalogue packs — local `data/<pack>/` corpora (cards-index + optional foil kit).
 *
 * Tabs are **franchise → product line**: Pokémon / Lorcana stay one line;
 * Dragon Ball has Masters + Fusion World. Naruto has several lines (Carddass,
 * 疾風伝, Ninja Ranks, Ultra Challenge, Mythos, Kayou) under one franchise tab.
 */

import {
  narutoCatalogueLineForCard as narutoLineForCard,
  narutoCatalogueLineForSealed as narutoLineForSealed,
  type NarutoCardLine,
} from "@/providers/narutocarddass/packs";

export const CATALOGUE_PACK_IDS = [
  "pokemon",
  "lorcana",
  "naruto/carddass",
  "naruto/shippuden",
  "naruto/ninja-ranks",
  "naruto/ultra-challenge",
  "naruto/mythos",
  "naruto/kayou",
  "dbs/cg",
  "dbs/fw",
  "onepiece",
  "digimon",
  "yugioh",
  "mtg",
] as const;
export type CataloguePackId = (typeof CATALOGUE_PACK_IDS)[number];

export type CatalogueBrowseScope = "foils" | "all" | "sealed";

/** Naruto disk / verso line — same game, different back and sealed SKUs. */
export type CatalogueCardLine = NarutoCardLine;

/**
 * Worker / admin extract target. May differ from the data pack id (Naruto:
 * pack `naruto/carddass`, target `naruto`) so a second line can take its own target
 * later (`naruto-ranks`, `naruto-ultra`) without breaking existing jobs.
 */
export type CatalogueExtractTarget =
  | "lorcana"
  | "pokemon"
  | "naruto"
  | "naruto-shippuden"
  | "naruto-ranks"
  | "naruto-ultra"
  | "naruto-mythos"
  | "naruto-kayou"
  | "dbs-cg"
  | "dbs-fw"
  | "onepiece"
  | "digimon"
  | "yugioh"
  | "mtg";

export type CatalogueFranchiseId =
  | "pokemon"
  | "lorcana"
  | "naruto"
  | "dbs"
  | "onepiece"
  | "digimon"
  | "yugioh"
  | "mtg";

/** Inventory / Lorcana — CDN scrape + extract within a dev session. */
export const CATALOGUE_EXTRACT_TIMEOUT_MS = 40 * 60 * 1000;

/** Pokémon catalogue (~93k bundles): scrape skip-pass + extract can run hours. */
export const CATALOGUE_EXTRACT_FULL_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/** Masters first-run Deckplanet dump (~10k WebP) plus Bandai scrape. */
export const CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * ``inventory`` (default) scrapes the derived APK ∪ Malie stem list.
 * ``catalogue`` re-dumps the CDN AssetManifests and scrapes everything they
 * list — authoritative and phantom-free, but that is the full ~93k bundles.
 */
export const CATALOGUE_EXTRACT_SCOPES = ["inventory", "catalogue"] as const;
export type CatalogueExtractScope = (typeof CATALOGUE_EXTRACT_SCOPES)[number];

/**
 * Server-side hook the extract runner runs after a successful extract.
 * Declarative token — this module stays client-bundle safe (no node:), so the
 * runner resolves the token to its dynamic import.
 */
export type CataloguePackPostExtract = "invalidatePokemonFoilNamesCache";

/** Extract descriptor — in-process pipeline via catalogueExtractRunner. */
export type CataloguePackExtract = {
  /**
   * Static header lines for the admin extract log. Packs whose command line
   * is dynamic (APK probe, scope flags) build their prelude in the runner.
   */
  prelude?: readonly string[];
  /** Default extract timeout. */
  timeoutMs: number;
  /** Heavier per-scope timeout (Pokémon catalogue scope). */
  timeoutMsByScope?: Partial<Record<CatalogueExtractScope, number>>;
  postExtract?: CataloguePackPostExtract;
  /**
   * Ordered pipeline steps the pack accepts via `--skip` / `--only`.
   * When set, the foil worker can resume after a crash by appending
   * `--skip` for `payload.completedSteps` (see catalogueExtractCheckpoint).
   */
  pipelineSteps?: readonly string[];
};

export type CataloguePackInfo = {
  id: CataloguePackId;
  /** Top-level Catalogue tab. Several packs share one franchise. */
  franchiseId: CatalogueFranchiseId;
  franchiseLabelFr: string;
  franchiseLabelEn: string;
  /** Product-line tab, shown when the franchise has more than one line. */
  lineLabelFr: string;
  lineLabelEn: string;
  /** Standalone pack name (logs, extract label, single-line tab). */
  labelFr: string;
  labelEn: string;
  /** Materials / WebGL playroom (Pokémon + Lorcana). */
  hasFoilEffects: boolean;
  /** Default scope when opening the pack. */
  defaultScope: CatalogueBrowseScope;
  /**
   * When a print has no face yet, reuse art from another print that shares the
   * same printed prefix + number (Naruto promo stub → retail — not NI→N).
   */
  sameNumberArtFallback?: boolean;
  /**
   * One grid tile per locale in `cards-index.json` (Naruto Carddass, Ninja
   * Ranks). Without this, `pickLang` keeps a single row and hides FR / IT /
   * EN faces that live on other lang slots.
   */
  expandLocales?: boolean;
  /**
   * When `expandLocales` is on, emit a tile for every listed locale even when
   * `cards-index.json` has no lang slot yet (shown as missing art, not hidden).
   */
  catalogueLocales?: readonly string[];
  /**
   * How catalogue tiles pick rectos across locales. Versos stay on the tile
   * locale; a missing back is honest. Any pack can opt in — see
   * `locale-specific-faces.json` next to `cards-index.json`.
   */
  localeArt?: {
    /** Neutral prints borrow the best recto among `catalogueLocales`. */
    bestFaceAcrossLocales?: boolean;
  };
  extractTarget: CatalogueExtractTarget;
  /** No APK lab — Bandai / Wayback catalogue sync. */
  catalogueOnly?: boolean;
  /** Foil meta hydrate + APK lab routes (Pokémon + Lorcana). */
  hasFoilMeta?: boolean;
  /**
   * Extract-presence probes, relative to `data/<pack>/` — foilStatus watches
   * their newest mtime; the newest hit over 200 bytes marks the extract present.
   */
  extractMarkers: readonly string[];
  /**
   * The pack "looks empty" (auto-sync kicks an extract) when none of these
   * paths exists, relative to `data/<pack>/`.
   */
  emptyUnless: readonly string[];
  /** Extract timeouts / prelude / resume steps (in-process runner). */
  extract: CataloguePackExtract;
  blurbFr?: string;
  blurbEn?: string;
};

export type CatalogueFranchise = {
  id: CatalogueFranchiseId;
  labelFr: string;
  labelEn: string;
  lines: readonly CataloguePackInfo[];
};

export const CATALOGUE_PACKS: readonly CataloguePackInfo[] = [
  {
    id: "pokemon",
    franchiseId: "pokemon",
    franchiseLabelFr: "Pokémon",
    franchiseLabelEn: "Pokémon",
    lineLabelFr: "Pokémon",
    lineLabelEn: "Pokémon",
    labelFr: "Pokémon",
    labelEn: "Pokémon",
    hasFoilEffects: true,
    hasFoilMeta: true,
    defaultScope: "foils",
    extractTarget: "pokemon",
    extractMarkers: [
      "foil/shaders",
      "foil/textures",
      "foil/materialSheets.json",
      "catalog.sqlite",
      "liveFoilMasks.json",
      "cards.json",
    ],
    emptyUnless: ["foil/shaders", "catalog.sqlite"],
    extract: {
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
      timeoutMsByScope: { catalogue: CATALOGUE_EXTRACT_FULL_TIMEOUT_MS },
      postExtract: "invalidatePokemonFoilNamesCache",
    },
  },
  {
    id: "lorcana",
    franchiseId: "lorcana",
    franchiseLabelFr: "Lorcana",
    franchiseLabelEn: "Lorcana",
    lineLabelFr: "Lorcana",
    lineLabelEn: "Lorcana",
    labelFr: "Lorcana",
    labelEn: "Lorcana",
    hasFoilEffects: true,
    hasFoilMeta: true,
    defaultScope: "foils",
    extractTarget: "lorcana",
    extractMarkers: [
      "foil/shaders",
      "foil/textures",
      "foil/web",
      "foil/manifest.json",
      "cards-index.json",
      "catalog.sqlite",
    ],
    emptyUnless: ["cards-index.json", "foil/web"],
    extract: {
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
  },
  {
    id: "naruto/carddass",
    franchiseId: "naruto",
    franchiseLabelFr: "Naruto",
    franchiseLabelEn: "Naruto",
    lineLabelFr: "Carddass",
    lineLabelEn: "Carddass",
    labelFr: "Naruto Carddass",
    labelEn: "Naruto Carddass",
    hasFoilEffects: false,
    defaultScope: "all",
    sameNumberArtFallback: true,
    extractTarget: "naruto",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Naruto: Carddass FR+IT+JA + CCG EN (Wayback / Coleka / Storm 3) → data/naruto/carddass",
        "scellés FR : packshots carddass.fr (boosters / starters / tin) → products-index.json",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
      pipelineSteps: [
        "scrape",
        "reconstruct",
        "index",
        "products",
        "thumbs",
        "checklist",
        "known",
        "sources",
      ],
    },
    blurbFr:
      "Un jeu, quatre langues. NI et N sont voisins, pas la même carte. S6 FR visible, pas addable.",
    blurbEn:
      "One game, four languages. NI and N sit side by side, they are not the same card. S6 FR visible, not addable.",
  },
  {
    /*
      Le 疾風伝, Ninja Ranks et Ultra Challenge sont des **lignes** de la
      franchise Naruto, pas des franchises à part : même onglet, plusieurs
      lignes — exactement comme Masters et Fusion World chez Dragon Ball. Ce
      qui les sépare est réel (autre jeu, autre maquette, autre dos), ce qui
      les rapproche aussi : c'est le même univers, et on les cherche au même
      endroit.
    */
    id: "naruto/shippuden",
    franchiseId: "naruto",
    franchiseLabelFr: "Naruto",
    franchiseLabelEn: "Naruto",
    lineLabelFr: "疾風伝",
    lineLabelEn: "疾風伝",
    labelFr: "Naruto 疾風伝",
    labelEn: "Naruto 疾風伝",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "naruto-shippuden",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Naruto 疾風伝 : registres officiels + verso curé → data/naruto/shippuden",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "Jeu 疾風伝 (2007-2009), japonais seul. Familles 忍伝 / 術伝 / 作伝, actes 第一幕 à 第四幕. Ni le Carddass, ni le CCG anglais.",
    blurbEn:
      "The 疾風伝 game (2007-2009), Japanese only. 忍伝 / 術伝 / 作伝 families, acts 第一幕 to 第四幕. Neither the Carddass nor the English CCG.",
  },
  {
    id: "naruto/ninja-ranks",
    franchiseId: "naruto",
    franchiseLabelFr: "Naruto",
    franchiseLabelEn: "Naruto",
    lineLabelFr: "Ninja Ranks",
    lineLabelEn: "Ninja Ranks",
    labelFr: "Naruto Ninja Ranks",
    labelEn: "Naruto Ninja Ranks",
    hasFoilEffects: false,
    defaultScope: "all",
    expandLocales: true,
    catalogueLocales: ["en", "fr", "it"],
    localeArt: { bestFaceAcrossLocales: true },
    extractTarget: "naruto-ranks",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Naruto Ninja Ranks : checklist Inkworks + packshots officiels + dumps fan → data/naruto/ninja-ranks",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "Panini / Inkworks, 2006 — grille FR 102 cartes. Une tuile par locale (FR Coleka, EN arcade, IT Imadoki). Les trous FR restent visibles tant qu'on n'a pas de scan attesté.",
    blurbEn:
      "Panini / Inkworks, 2006 — 102-card FR grid. One tile per locale (FR Coleka, EN arcade, IT Imadoki). FR gaps stay visible until an attested scan exists.",
  },
  {
    id: "naruto/ultra-challenge",
    franchiseId: "naruto",
    franchiseLabelFr: "Naruto",
    franchiseLabelEn: "Naruto",
    lineLabelFr: "Ultra Challenge",
    lineLabelEn: "Ultra Challenge",
    labelFr: "Naruto Ultra Challenge",
    labelEn: "Naruto Ultra Challenge",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "naruto-ultra",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Naruto Ultra Challenge : album + pochette (upscales) ; cartes encore vides → data/naruto/ultra-challenge",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "Panini Ultra Challenge (lamincards, 2007). Ni le Carddass, ni le 疾風伝, ni Ninja Ranks. Album et pochette (upscales) ; cartes encore vides.",
    blurbEn:
      "Panini Ultra Challenge (lamincards, 2007). Neither the Carddass, the 疾風伝, nor Ninja Ranks. Album and booster (upscales); no cards ingested yet.",
  },
  {
    id: "naruto/mythos",
    franchiseId: "naruto",
    franchiseLabelFr: "Naruto",
    franchiseLabelEn: "Naruto",
    lineLabelFr: "Mythos",
    lineLabelEn: "Mythos",
    labelFr: "Naruto Mythos",
    labelEn: "Naruto Mythos",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "naruto-mythos",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Naruto Mythos (CICABOOM) : bootstrap catalogue vide → data/naruto/mythos",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "CICABOOM Naruto Mythos TCG (Konoha Shidō, 2025–). Autre jeu que Carddass, Ninja Ranks, Ultra Challenge et Kayou. Catalogue local vide.",
    blurbEn:
      "CICABOOM Naruto Mythos TCG (Konoha Shidō, 2025–). A different game from Carddass, Ninja Ranks, Ultra Challenge, and Kayou. Empty local catalogue.",
  },
  {
    id: "naruto/kayou",
    franchiseId: "naruto",
    franchiseLabelFr: "Naruto",
    franchiseLabelEn: "Naruto",
    lineLabelFr: "Kayou",
    lineLabelEn: "Kayou",
    labelFr: "Naruto Kayou",
    labelEn: "Naruto Kayou",
    hasFoilEffects: true,
    defaultScope: "foils",
    extractTarget: "naruto-kayou",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Naruto Kayou : bootstrap catalogue vide → data/naruto/kayou",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "Kayou Naruto — cartes à collectionner (pas un TCG jouable). Autre éditeur que Bandai et CICABOOM Mythos. Catalogue local vide.",
    blurbEn:
      "Kayou Naruto — collectible cards (not a playable TCG). Different publisher from Bandai and CICABOOM Mythos. Empty local catalogue.",
  },
  {
    id: "dbs/cg",
    franchiseId: "dbs",
    franchiseLabelFr: "Dragon Ball",
    franchiseLabelEn: "Dragon Ball",
    lineLabelFr: "Masters",
    lineLabelEn: "Masters",
    labelFr: "Dragon Ball Masters",
    labelEn: "Dragon Ball Masters",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "dbs-cg",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Dragon Ball Masters: cardlists Bandai FR+EN + clone TCG Arena → data/dbs/cg",
        "noms FR et EN dans l’index ; faces HTTP (FR dbscards / Bandai) séquentielles ; dump EN déjà rangé ignoré — --force pour écraser",
        "graphe produit→cartes (decks / coffrets) — HTML déjà là = reprise",
      ],
      timeoutMs: CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
      pipelineSteps: ["scrape", "dbscards", "products", "arena", "faces"],
    },
    blurbFr:
      "Catalogue Bandai Masters — faces Deckplanet (sync), SAMPLE en fallback",
    blurbEn:
      "Bandai Masters catalogue — Deckplanet faces on sync, SAMPLE fallback",
  },
  {
    id: "dbs/fw",
    franchiseId: "dbs",
    franchiseLabelFr: "Dragon Ball",
    franchiseLabelEn: "Dragon Ball",
    lineLabelFr: "Fusion World",
    lineLabelEn: "Fusion World",
    labelFr: "Dragon Ball Fusion World",
    labelEn: "Dragon Ball Fusion World",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "dbs-fw",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Dragon Ball Fusion World: Bandai fw/en cardlist → data/dbs/fw",
        "graphe produit→cartes (decks / coffrets) — HTML déjà là = reprise",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
      pipelineSteps: ["scrape", "dbscards", "products", "faces", "details"],
    },
    blurbFr: "Catalogue Bandai Fusion World — faces SAMPLE, pas de dump foil",
    blurbEn: "Bandai Fusion World catalogue — SAMPLE faces, no foil dump",
  },
  {
    id: "onepiece",
    franchiseId: "onepiece",
    franchiseLabelFr: "One Piece",
    franchiseLabelEn: "One Piece",
    lineLabelFr: "Card Game",
    lineLabelEn: "Card Game",
    labelFr: "One Piece Card Game",
    labelEn: "One Piece Card Game",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "onepiece",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "One Piece Card Game: punk-records (FR/EN) + faces Bandai + opecards.fr",
        "Titres et printKeys depuis buhbbl/punk-records ; images cardlist officiel",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "Catalogue OPTCG Bandai — punk-records + faces cardlist ; scellé opecards.fr.",
    blurbEn:
      "Bandai OPTCG catalogue — punk-records + official cardlist faces; sealed via opecards.fr.",
  },
  {
    id: "digimon",
    franchiseId: "digimon",
    franchiseLabelFr: "Digimon",
    franchiseLabelEn: "Digimon",
    lineLabelFr: "Card Game",
    lineLabelEn: "Card Game",
    labelFr: "Digimon Card Game",
    labelEn: "Digimon Card Game",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "digimon",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Digimon Card Game: bootstrap catalogue vide → data/digimon",
        "Moisson digimoncard.io / apitcg à brancher",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr: "Catalogue Digimon Card Game — onglet prêt, moisson à brancher.",
    blurbEn: "Digimon Card Game catalogue — tab ready, ingest pending.",
  },
  {
    id: "yugioh",
    franchiseId: "yugioh",
    franchiseLabelFr: "Yu-Gi-Oh!",
    franchiseLabelEn: "Yu-Gi-Oh!",
    lineLabelFr: "TCG",
    lineLabelEn: "TCG",
    labelFr: "Yu-Gi-Oh!",
    labelEn: "Yu-Gi-Oh!",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "yugioh",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Yu-Gi-Oh!: bootstrap catalogue vide → data/yugioh",
        "Moisson YGOPRODeck à brancher",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr:
      "Catalogue Yu-Gi-Oh! — onglet prêt, moisson YGOPRODeck à brancher.",
    blurbEn: "Yu-Gi-Oh! catalogue — tab ready, YGOPRODeck ingest pending.",
  },
  {
    id: "mtg",
    franchiseId: "mtg",
    franchiseLabelFr: "Magic",
    franchiseLabelEn: "Magic",
    lineLabelFr: "The Gathering",
    lineLabelEn: "The Gathering",
    labelFr: "Magic: The Gathering",
    labelEn: "Magic: The Gathering",
    hasFoilEffects: false,
    defaultScope: "all",
    extractTarget: "mtg",
    catalogueOnly: true,
    extractMarkers: [
      "cards-index.json",
      "catalog.sqlite",
      "cards",
      "cards/back.webp",
    ],
    emptyUnless: ["cards-index.json", "catalog.sqlite"],
    extract: {
      prelude: [
        "Magic: The Gathering: bootstrap catalogue vide → data/mtg",
        "Moisson Scryfall à brancher",
      ],
      timeoutMs: CATALOGUE_EXTRACT_TIMEOUT_MS,
    },
    blurbFr: "Catalogue Magic — onglet prêt, moisson Scryfall à brancher.",
    blurbEn: "Magic catalogue — tab ready, Scryfall ingest pending.",
  },
];

export function isCataloguePackId(value: unknown): value is CataloguePackId {
  return (
    typeof value === "string" &&
    (CATALOGUE_PACK_IDS as readonly string[]).includes(value)
  );
}

export function cataloguePackInfo(
  id: string | null | undefined,
): CataloguePackInfo | null {
  if (!id) return null;
  return CATALOGUE_PACKS.find((pack) => pack.id === id) ?? null;
}

export function catalogueFranchises(): CatalogueFranchise[] {
  const lines = new Map<CatalogueFranchiseId, CataloguePackInfo[]>();
  const labels = new Map<
    CatalogueFranchiseId,
    { labelFr: string; labelEn: string }
  >();
  for (const pack of CATALOGUE_PACKS) {
    const list = lines.get(pack.franchiseId);
    if (list) {
      list.push(pack);
      continue;
    }
    lines.set(pack.franchiseId, [pack]);
    labels.set(pack.franchiseId, {
      labelFr: pack.franchiseLabelFr,
      labelEn: pack.franchiseLabelEn,
    });
  }
  return [...lines.entries()].map(([id, packLines]) => {
    const label = labels.get(id)!;
    return {
      id,
      labelFr: label.labelFr,
      labelEn: label.labelEn,
      lines: packLines,
    };
  });
}

export function catalogueFranchiseForPack(
  packId: string | null | undefined,
): CatalogueFranchise | null {
  const pack = cataloguePackInfo(packId);
  if (!pack) return null;
  return (
    catalogueFranchises().find((row) => row.id === pack.franchiseId) ?? null
  );
}

export function cataloguePackForExtractTarget(
  target: string | null | undefined,
): CataloguePackInfo | null {
  if (!target) return null;
  return CATALOGUE_PACKS.find((pack) => pack.extractTarget === target) ?? null;
}

export function foilExtractNeedsApk(
  target: string | null | undefined,
): boolean {
  const pack = cataloguePackForExtractTarget(target);
  if (!pack) return true;
  return pack.catalogueOnly !== true;
}

export function resolveCataloguePackId(
  slug: string | null | undefined,
): CataloguePackId | null {
  const raw = (slug ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (isCataloguePackId(raw)) return raw;
  if (raw === "naruto/ccg" || raw === "naruto/en-ccg") return "naruto/carddass";
  const wanted = raw.replace(/[^a-z0-9]/g, "");
  if (!wanted) return null;
  const aliases: Record<string, CataloguePackId> = {
    pokemonpaper: "pokemon",
    carddass: "naruto/carddass",
    naruto: "naruto/carddass",
    cacg: "naruto/carddass",
    narutocacg: "naruto/carddass",
    jcc: "naruto/carddass",
    ccg: "naruto/carddass",
    enccg: "naruto/carddass",
    narutoen: "naruto/carddass",
    narutoenccg: "naruto/carddass",
    bandaiusa: "naruto/carddass",
    bandaiccg: "naruto/carddass",
    storm3: "naruto/carddass",
    shippuden: "naruto/shippuden",
    ninjaranks: "naruto/ninja-ranks",
    ultrachallenge: "naruto/ultra-challenge",
    lamincards: "naruto/ultra-challenge",
    mythos: "naruto/mythos",
    kayou: "naruto/kayou",
    dbs: "dbs/cg",
    dragonball: "dbs/cg",
    masters: "dbs/cg",
    dbsmasters: "dbs/cg",
    fusionworld: "dbs/fw",
    onepiece: "onepiece",
    optcg: "onepiece",
    digimon: "digimon",
    yugioh: "yugioh",
    ygo: "yugioh",
    mtg: "mtg",
    magic: "mtg",
    scryfall: "mtg",
  };
  const mapped = aliases[wanted];
  if (mapped) return mapped;
  const prefixed = CATALOGUE_PACK_IDS.filter((id) =>
    id.replace(/[^a-z0-9]/g, "").startsWith(wanted),
  );
  return prefixed.length === 1 ? prefixed[0]! : null;
}

export function resolveCatalogueScope(
  value: string | null | undefined,
  pack: CataloguePackInfo,
): CatalogueBrowseScope {
  const raw = (value ?? "").trim().toLowerCase();
  if (
    raw === "sealed" ||
    raw === "scelles" ||
    raw === "scellés" ||
    raw === "products"
  ) {
    return "sealed";
  }
  if (!pack.hasFoilEffects) return "all";
  if (raw === "all" || raw === "toutes" || raw === "cards") return "all";
  if (raw === "foils" || raw === "foil" || raw === "effects") return "foils";
  return pack.defaultScope;
}

/**
 * URL semantics of switching the active Catalogue tab. A pack change must drop
 * a material that does not exist in the next pack, and force `scope=all` on a
 * pack with no foil effects — otherwise the browser opens on an empty "Foils".
 */
export function applyCataloguePackParams(
  params: URLSearchParams,
  packId: string,
): void {
  params.set("pack", packId);
  params.delete("material");
  const next = cataloguePackInfo(packId);
  const scope = params.get("scope");
  if (next && !next.hasFoilEffects) {
    if (scope !== "sealed") params.set("scope", "all");
  } else if (next?.defaultScope === "foils") {
    if (scope !== "sealed" && scope !== "all") {
      params.delete("scope");
    }
  }
}

/**
 * Catalogue pack behind a catalog corpus. `ProviderCatalogHooks.dataPack` is
 * the pack id, so core never has to know provider names — keeping this side
 * provider-blind (see `blindnessGuard`).
 */
export function cataloguePackForDataPack(
  dataPack: string | null | undefined,
): CataloguePackInfo | null {
  return cataloguePackInfo(dataPack);
}

/** Disk pack behind a Catalogue tab. */
export function catalogueCorpusPack(packId: string): string {
  if (packId === "naruto/en-ccg") return "naruto/carddass";
  return packId;
}

export function narutoCatalogueLineForCard(
  card: string,
  set?: string,
): CatalogueCardLine {
  return narutoLineForCard(card, set);
}

export function narutoCatalogueLineForSealed(entry: {
  lang?: string | null;
  setCode?: string | null;
  slug: string;
}): CatalogueCardLine {
  return narutoLineForSealed(entry);
}
