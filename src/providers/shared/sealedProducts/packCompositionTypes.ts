/**
 * Types + helpers composition sachet — **client-safe** (pas de `node:fs`).
 * I/O disque : {@link ./boosterComposition}.
 */

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

/**
 * Composition de sachet **portée par un SKU** (contrat catalogue).
 * Source de vérité runtime — le fichier pack n'est qu'une graine curated.
 */
export type SkuPackComposition = {
  slots: BoosterSlot[];
  rarityHits: Record<string, RarityHitRate>;
  cardsPerPack?: number | null;
  /**
   * Confiance globale de la grille (slots officiels + taux community OK).
   * `"structural"` = slots dérivés sans taux chase inventés.
   */
  provenance: PullRateConfidence | "structural" | "unknown";
  source?: string;
  verifiedAt?: string;
  /**
   * Inserts qui **peuvent** sortir en plus des slots comptés (ex. Fixeez
   * Leclerc) — hors des N cartes, taux inconnu / non inventé. Pas un slot
   * partagé « carte ou chase ».
   */
  possibleChase?: string[];
};

/**
 * Champ SKU `packComposition` :
 * - `null` / absent = non vérifié (trou)
 * - `"none"` = pas de loterie sachet
 * - objet = grille attestée de **ce** SKU
 */
export type PackCompositionField = SkuPackComposition | "none" | null;

/** Copie un profil graine → objet SKU (pas de référence partagée). */
export function profileToSkuPackComposition(
  profile: BoosterCompositionProfile,
): SkuPackComposition {
  const slots = (profile.slots ?? []).map((slot) => ({
    id: slot.id,
    count: slot.count,
    kind: slot.kind,
    rarities: [...slot.rarities],
  }));
  const rarityHits: Record<string, RarityHitRate> = {};
  for (const [key, hit] of Object.entries(profile.rarityHits)) {
    rarityHits[key] = {
      ...hit,
      ...(hit.aliases ? { aliases: [...hit.aliases] } : {}),
    };
  }
  const hasCommunity = Object.values(rarityHits).some(
    (h) => h.confidence === "community" || h.confidence === "estimate",
  );
  const hasOfficial = Object.values(rarityHits).some(
    (h) => h.confidence === "official",
  );
  return {
    slots,
    rarityHits,
    cardsPerPack: profile.cardsPerPack,
    provenance: hasOfficial
      ? "official"
      : hasCommunity
        ? "community"
        : slots.length > 0
          ? "structural"
          : "unknown",
    source: profile.source,
    verifiedAt: profile.verifiedAt,
  };
}

/** Profil temporaire pour dériver `packsPerHit` / p_x depuis un SKU. */
export function skuPackCompositionAsProfile(
  composition: SkuPackComposition,
): BoosterCompositionProfile {
  return {
    source: composition.source ?? "",
    verifiedAt: composition.verifiedAt ?? "",
    cardsPerPack: composition.cardsPerPack ?? 0,
    slots: composition.slots,
    rarityHits: composition.rarityHits,
  };
}

/** SKU à loterie sachet (besoin d'une grille, pas `"none"`). */
export function sealedSkuNeedsPackComposition(entry: {
  behavior: string;
  kind?: string;
}): boolean {
  return (
    entry.behavior === "random_pack" ||
    entry.behavior === "pack_container" ||
    entry.behavior === "mixed_bundle"
  );
}

/** Objet composition attesté (pas `null` / `"none"`). */
export function isSkuPackComposition(
  value: PackCompositionField | undefined,
): value is SkuPackComposition {
  return value != null && value !== "none" && typeof value === "object";
}
