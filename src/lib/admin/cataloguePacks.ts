/**
 * Admin Catalogue packs — local `data/<pack>/` corpora (cards-index + optional foil kit).
 * Foil playroom packs are a subset; Naruto is catalogue-only.
 */

export const CATALOGUE_PACK_IDS = ["pokemon", "lorcana", "naruto/ccg"] as const;
export type CataloguePackId = (typeof CATALOGUE_PACK_IDS)[number];

export type CatalogueBrowseScope = "foils" | "all";

export type CataloguePackInfo = {
  id: CataloguePackId;
  labelFr: string;
  labelEn: string;
  /** Materials / WebGL playroom (Pokémon + Lorcana). */
  hasFoilEffects: boolean;
  /** Default scope when opening the pack. */
  defaultScope: CatalogueBrowseScope;
};

export const CATALOGUE_PACKS: readonly CataloguePackInfo[] = [
  {
    id: "pokemon",
    labelFr: "Pokémon",
    labelEn: "Pokémon",
    hasFoilEffects: true,
    defaultScope: "foils",
  },
  {
    id: "lorcana",
    labelFr: "Lorcana",
    labelEn: "Lorcana",
    hasFoilEffects: true,
    defaultScope: "foils",
  },
  {
    id: "naruto/ccg",
    labelFr: "Naruto CCG",
    labelEn: "Naruto CCG",
    hasFoilEffects: false,
    defaultScope: "all",
  },
] as const;

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

export function resolveCataloguePackId(
  slug: string | null | undefined,
): CataloguePackId | null {
  const raw = (slug ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (isCataloguePackId(raw)) return raw;
  const wanted = raw.replace(/[^a-z0-9]/g, "");
  if (!wanted) return null;
  const aliases: Record<string, CataloguePackId> = {
    pokemonpaper: "pokemon",
    carddass: "naruto/ccg",
    naruto: "naruto/ccg",
    cacg: "naruto/ccg",
    ccg: "naruto/ccg",
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
  if (!pack.hasFoilEffects) return "all";
  if (raw === "all" || raw === "toutes" || raw === "cards") return "all";
  if (raw === "foils" || raw === "foil" || raw === "effects") return "foils";
  return pack.defaultScope;
}
