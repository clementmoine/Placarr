/**
 * Admin Catalogue packs — local `data/<pack>/` corpora (cards-index + optional foil kit).
 *
 * Tabs are **franchise → product line**: Pokémon / Lorcana stay one line;
 * Dragon Ball has Masters + Fusion World. Naruto is one catalogue (Carddass):
 * NI sits beside N, FR / EN / IT / JA are language slots.
 */

import {
  narutoCatalogueLineForCard as narutoLineForCard,
  narutoCatalogueLineForSealed as narutoLineForSealed,
  type NarutoCardLine,
} from "@/providers/narutoccg/packs";

export const CATALOGUE_PACK_IDS = [
  "pokemon",
  "lorcana",
  "naruto/carddass",
  "naruto/shippuden",
  "dbs/cg",
  "dbs/fw",
] as const;
export type CataloguePackId = (typeof CATALOGUE_PACK_IDS)[number];

export type CatalogueBrowseScope = "foils" | "all" | "sealed";

/** Naruto disk / verso line — same game, different back and sealed SKUs. */
export type CatalogueCardLine = NarutoCardLine;

/**
 * Worker / admin extract target. May differ from the data pack id (Naruto:
 * pack `naruto/carddass`, target `naruto`) so a second line can take its own target
 * later (`naruto-panini`) without breaking existing jobs.
 */
export type CatalogueExtractTarget =
  "lorcana" | "pokemon" | "naruto" | "naruto-shippuden" | "dbs-cg" | "dbs-fw";

export type CatalogueFranchiseId = "pokemon" | "lorcana" | "naruto" | "dbs";

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
  extractTarget: CatalogueExtractTarget;
  /** No APK lab — Bandai / Wayback catalogue sync. */
  catalogueOnly?: boolean;
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
    defaultScope: "foils",
    extractTarget: "pokemon",
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
    defaultScope: "foils",
    extractTarget: "lorcana",
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
    blurbFr:
      "Un jeu, quatre langues. NI et N sont voisins, pas la même carte. S6 FR visible, pas addable.",
    blurbEn:
      "One game, four languages. NI and N sit side by side, they are not the same card. S6 FR visible, not addable.",
  },
  {
    /*
      Le 疾風伝 est une **ligne** de la franchise Naruto, pas une franchise à
      part : même onglet, deux lignes — exactement comme Masters et Fusion World
      chez Dragon Ball. Ce qui les sépare est réel (autre jeu, autre maquette,
      autre dos), ce qui les rapproche aussi : c'est le même univers, et on les
      cherche au même endroit.
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
    blurbFr:
      "Jeu 疾風伝 (2007-2009), japonais seul. Familles 忍伝 / 術伝 / 作伝, actes 第一幕 à 第四幕. Ni le Carddass, ni le CCG anglais.",
    blurbEn:
      "The 疾風伝 game (2007-2009), Japanese only. 忍伝 / 術伝 / 作伝 families, acts 第一幕 to 第四幕. Neither the Carddass nor the English CCG.",
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
    blurbFr: "Catalogue Bandai Fusion World — faces SAMPLE, pas de dump foil",
    blurbEn: "Bandai Fusion World catalogue — SAMPLE faces, no foil dump",
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
    jcc: "naruto/carddass",
    ccg: "naruto/carddass",
    enccg: "naruto/carddass",
    narutoen: "naruto/carddass",
    bandaiusa: "naruto/carddass",
    bandaiccg: "naruto/carddass",
    storm3: "naruto/carddass",
    dbs: "dbs/cg",
    dragonball: "dbs/cg",
    masters: "dbs/cg",
    fusionworld: "dbs/fw",
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
