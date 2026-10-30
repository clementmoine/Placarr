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
 *
 * Types / helpers purs (client-safe) : {@link ./packCompositionTypes}.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { packDataDir } from "@/lib/packPaths";

export type {
  BoosterCompositionFile,
  BoosterCompositionProfile,
  BoosterSlot,
  PackCompositionField,
  PullRateConfidence,
  RarityHitRate,
  SkuPackComposition,
} from "./packCompositionTypes";
export {
  isSkuPackComposition,
  profileToSkuPackComposition,
  sealedSkuNeedsPackComposition,
  skuPackCompositionAsProfile,
} from "./packCompositionTypes";

import type {
  BoosterCompositionFile,
  BoosterCompositionProfile,
  RarityHitRate,
} from "./packCompositionTypes";

export function curatedBoosterCompositionPath(packId: string): string {
  return path.join(packDataDir(packId), "curated", "booster-composition.json");
}

export function readBoosterCompositionFile(
  packId: string,
): BoosterCompositionFile | null {
  const file = curatedBoosterCompositionPath(packId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(file, "utf8"),
    ) as BoosterCompositionFile;
    if (parsed?.version !== 1 || !parsed.default?.rarityHits) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Normalise `Super_rare` / `Super Rare` / `super  rare` pour matcher. */
export function normalizeRarityKey(label: string): string {
  return label.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
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
 * Clé canonique de rareté (entrée `rarityHits` si connue, sinon normalisée).
 * Agrège `Commune` / `Common` sous la même clé pour compter N_r.
 */
export function canonicalRarityKey(
  profile: BoosterCompositionProfile,
  rarity: string | null | undefined,
): string | null {
  if (!rarity?.trim()) return null;
  const want = normalizeRarityKey(rarity);
  for (const [label, hit] of Object.entries(profile.rarityHits)) {
    if (normalizeRarityKey(label) === want) return normalizeRarityKey(label);
    for (const alias of hit.aliases ?? []) {
      if (normalizeRarityKey(alias) === want) return normalizeRarityKey(label);
    }
  }
  return want;
}

/**
 * Slots `dedicated` qui accueillent cette rareté. La liste `rarities` d'un
 * slot dédié = les **graphies** d'une même rareté (`Common` / `Commune` /
 * `C`), pas plusieurs raretés en concurrence (ça, c'est `shared`).
 */
function dedicatedSlotsFor(profile: BoosterCompositionProfile, rarity: string) {
  const canon = canonicalRarityKey(profile, rarity);
  if (!canon) return [];
  return (profile.slots ?? []).filter(
    (slot) =>
      slot.kind === "dedicated" &&
      slot.rarities.some(
        (label) => canonicalRarityKey(profile, label) === canon,
      ),
  );
}

/**
 * Tirages dédiés / sachet pour une rareté.
 * `packsPerHit` structural = 1 / draws — pas un taux inventé, lecture des slots.
 */
export function dedicatedDrawsPerPack(
  profile: BoosterCompositionProfile,
  rarity: string | null | undefined,
): number | null {
  if (!rarity?.trim()) return null;
  let draws = 0;
  for (const slot of dedicatedSlotsFor(profile, rarity)) draws += slot.count;
  return draws > 0 ? draws : null;
}

/**
 * Clé de regroupement pour compter N_r : les graphies d'un même slot dédié
 * (`Common` et `Commune` dans un même pool) comptent ensemble ; sinon la
 * clé canonique.
 */
function rarityGroupKey(
  profile: BoosterCompositionProfile,
  rarity: string | null | undefined,
): string | null {
  if (!rarity?.trim()) return null;
  const slot = dedicatedSlotsFor(profile, rarity)[0];
  return slot ? `slot:${slot.id}` : canonicalRarityKey(profile, rarity);
}

/**
 * packsPerHit « une carte de cette rareté » : rarityHits, sinon 1/dedicatedDraws.
 */
export function packsPerHitAnyOfRarity(
  profile: BoosterCompositionProfile,
  rarity: string | null | undefined,
): number | null {
  const hit = rarityHitFor(profile, rarity);
  if (hit && hit.packsPerHit > 0) return hit.packsPerHit;
  const draws = dedicatedDrawsPerPack(profile, rarity);
  if (draws == null || draws <= 0) return null;
  return 1 / draws;
}

/**
 * Construit `printKey → packs pour toucher CE print` à partir du profil et des
 * raretés du set (compte des pairs inclus).
 *
 * Sans `rarityHits` pour une rareté : dérive des slots **dedicated** (provenance
 * structurale). Slot shared sans poids → pas de taux (indéterminé).
 */
export function specificPacksPerHitByPrint(input: {
  profile: BoosterCompositionProfile;
  /** Tous les tirages du pool (set), avec leur rareté. */
  pool: readonly { printKey: string; rarity: string | null | undefined }[];
}): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of input.pool) {
    const key = rarityGroupKey(input.profile, row.rarity);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out = new Map<string, number>();
  for (const row of input.pool) {
    if (!row.rarity) continue;
    const packsAny = packsPerHitAnyOfRarity(input.profile, row.rarity);
    if (packsAny == null) continue;
    const group = rarityGroupKey(input.profile, row.rarity);
    const n = group ? (counts.get(group) ?? 0) : 0;
    const packs = packsPerHitForSpecificPrint({
      packsPerHitAnyOfRarity: packsAny,
      printsOfSameRarityInPool: n,
    });
    if (packs != null) out.set(row.printKey, packs);
  }
  return out;
}
