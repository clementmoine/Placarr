/**
 * Composition de booster + taux de tirage (`packsPerHit`) par rareté.
 *
 * Ce n'est **pas** un `dropRate` par print : dans un TCG classique, toutes les
 * Enchanted d'un chapitre partagent ~1/96 packs ; le print précis dépend du
 * nombre de pairs de même rareté dans le set.
 *
 * Fichier runtime : `data/<pack>/curated/booster-composition.json`
 * Source commitée (ADR-006) : `src/providers/<id>/curated/booster-composition.json`
 * exposée via `ProviderModule.loadBoosterComposition`.
 *
 * Absent / `null` = on ne sait pas ; le conseil retombe sur le modèle uniforme.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { packDataDir } from "@/lib/packPaths";

/** Confiance sur le chiffre — jamais inventé sans le dire. */
export type PullRateConfidence = "official" | "community" | "estimate";

/**
 * Combien de sachets (en moyenne) pour voir **au moins une** carte de cette
 * rareté. Ex. Enchanted Lorcana ≈ 96 packs ≈ 4 displays (casier courant).
 */
export type RarityHitRate = {
  packsPerHit: number;
  /** Raccourci d'affichage : packsPerHit / packsPerDisplay. */
  displaysPerHit?: number | null;
  confidence: PullRateConfidence;
  source?: string;
  notes?: string;
  /**
   * Libellés catalogue localisés (FR `Enchantée`, DE `Verzaubert`, …).
   * La clé de `rarityHits` reste le nom canonique EN.
   */
  aliases?: string[];
};

export type BoosterSlot = {
  id: string;
  count: number;
  kind: "dedicated" | "shared";
  /** Libellés de rareté qui peuvent tomber dans ce slot. */
  rarities: string[];
};

export type BoosterCompositionProfile = {
  source: string;
  verifiedAt: string;
  notes?: string;
  cardsPerPack: number;
  packsPerDisplay?: number | null;
  displaysPerCase?: number | null;
  slots?: BoosterSlot[];
  /** Clé = libellé rareté catalogue (`Enchanted`, `Legendary`, …). */
  rarityHits: Record<string, RarityHitRate>;
};

export type BoosterCompositionFile = {
  version: 1;
  pack: string;
  updatedAt: string;
  notes?: string;
  default: BoosterCompositionProfile;
  /** Surcharges par id de set catalogue (`1`, `9`, …). */
  bySet?: Record<string, Partial<BoosterCompositionProfile>>;
};

export function curatedBoosterCompositionPath(packId: string): string {
  return path.join(packDataDir(packId), "curated", "booster-composition.json");
}

export function readBoosterCompositionFile(
  packId: string,
): BoosterCompositionFile | null {
  const file = curatedBoosterCompositionPath(packId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as BoosterCompositionFile;
    if (parsed?.version !== 1 || !parsed.default?.rarityHits) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Normalise `Super_rare` / `Super Rare` / `super  rare` pour matcher. */
export function normalizeRarityKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function resolveBoosterComposition(
  file: BoosterCompositionFile,
  setId?: string | null,
): BoosterCompositionProfile {
  const override =
    setId && file.bySet
      ? (file.bySet[setId] ?? file.bySet[setId.replace(/^0+/, "")] ?? null)
      : null;
  if (!override) return file.default;
  return {
    ...file.default,
    ...override,
    rarityHits: {
      ...file.default.rarityHits,
      ...(override.rarityHits ?? {}),
    },
    slots: override.slots ?? file.default.slots,
  };
}

export function rarityHitFor(
  profile: BoosterCompositionProfile,
  rarity: string | null | undefined,
): RarityHitRate | null {
  if (!rarity?.trim()) return null;
  const want = normalizeRarityKey(rarity);
  for (const [label, hit] of Object.entries(profile.rarityHits)) {
    if (normalizeRarityKey(label) === want) return hit;
    for (const alias of hit.aliases ?? []) {
      if (normalizeRarityKey(alias) === want) return hit;
    }
  }
  return null;
}

/**
 * Sachets pour espérer **cette** carte précise, si la rareté est équiprobable
 * dans son pool : `packsPerHit(rareté) × N_r`.
 */
export function packsPerHitForSpecificPrint(input: {
  packsPerHitAnyOfRarity: number;
  printsOfSameRarityInPool: number;
}): number | null {
  const { packsPerHitAnyOfRarity, printsOfSameRarityInPool } = input;
  if (!(packsPerHitAnyOfRarity > 0) || printsOfSameRarityInPool <= 0) {
    return null;
  }
  return packsPerHitAnyOfRarity * printsOfSameRarityInPool;
}

/**
 * Construit `printKey → packs pour toucher CE print` à partir du profil et des
 * raretés du set (compte des pairs inclus).
 */
export function specificPacksPerHitByPrint(input: {
  profile: BoosterCompositionProfile;
  /** Tous les tirages du pool (set), avec leur rareté. */
  pool: readonly { printKey: string; rarity: string | null | undefined }[];
}): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of input.pool) {
    if (!row.rarity?.trim()) continue;
    const key = normalizeRarityKey(row.rarity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out = new Map<string, number>();
  for (const row of input.pool) {
    const hit = rarityHitFor(input.profile, row.rarity);
    if (!hit || !row.rarity) continue;
    const n = counts.get(normalizeRarityKey(row.rarity)) ?? 0;
    const packs = packsPerHitForSpecificPrint({
      packsPerHitAnyOfRarity: hit.packsPerHit,
      printsOfSameRarityInPool: n,
    });
    if (packs != null) out.set(row.printKey, packs);
  }
  return out;
}
