/**
 * Seed / stub scellés communs à **toute** op Leclerc supermarché :
 * album + pochette (+ display, packsContained inconnu tant que non attesté).
 * Art optionnel — curated overlay quand on a les packshots.
 */
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import type { PackCompositionField } from "@/providers/shared/sealedProducts/packCompositionTypes";

import { leclercSetLabel } from "./printKey";

export const LECLERC_SEALED_SEED_SLUGS = [
  "collector-album",
  "pochette",
  "display",
] as const;

export type LeclercSealedSeedSlug = (typeof LECLERC_SEALED_SEED_SLUGS)[number];

export type LeclercSealedSkuDraft = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  /** Nom de fichier sous `products/<set>/<slug>/<lang>/` — absent = stub sans art. */
  art?: string | null;
  back?: string | null;
  declaredCardCount: number | null;
  cardsPerPack?: number | null;
  packsContained?: number | null;
  priceCents?: number | null;
  packComposition?: PackCompositionField;
};

/** Titre d'op pour libellés Album / Pochette / Display. */
export function leclercCampaignTitle(setCode: string): string {
  const label = leclercSetLabel(setCode);
  const colon = label.indexOf(": ");
  if (colon >= 0) return label.slice(colon + 2).trim() || label;
  return label.replace(/^\d{4}\s+/, "").trim() || label;
}

/** 4 cartes dédiées — structure Leclerc ; chase (Fixeez) seulement en curated. */
export const LECLERC_POCHETTE_PACK_COMPOSITION: Exclude<
  PackCompositionField,
  "none" | null
> = {
  provenance: "structural",
  source:
    "seed — 4 cartes / pochette (structure Leclerc) ; chase hors slots seulement si attesté en curated",
  verifiedAt: "2026-10-23",
  cardsPerPack: 4,
  slots: [
    {
      id: "card",
      count: 4,
      kind: "dedicated",
      rarities: ["card"],
    },
  ],
  rarityHits: {},
};

/** Stubs album + pochette + display pour un setCode. */
export function leclercSealedSeedProducts(
  setCode: string,
): LeclercSealedSkuDraft[] {
  const title = leclercCampaignTitle(setCode);
  return [
    {
      slug: "collector-album",
      kind: "coffret",
      category: "albums",
      name: `Album — ${title}`,
      declaredCardCount: null,
      priceCents: null,
      packComposition: "none",
    },
    {
      slug: "pochette",
      kind: "booster",
      category: "boosters",
      name: `Pochette — ${title}`,
      declaredCardCount: 4,
      cardsPerPack: 4,
      priceCents: null,
      packComposition: {
        ...LECLERC_POCHETTE_PACK_COMPOSITION,
        slots: LECLERC_POCHETTE_PACK_COMPOSITION.slots.map((slot) => ({
          ...slot,
          rarities: [...slot.rarities],
        })),
        rarityHits: {},
      },
    },
    {
      slug: "display",
      kind: "display",
      category: "displays",
      name: `Display — ${title}`,
      declaredCardCount: null,
      /** Cartes / pochette contenue — pas le total display. */
      cardsPerPack: 4,
      /** Nombre de pochettes : inconnu tant que non attesté (pas inventé). */
      packsContained: null,
      priceCents: null,
    },
  ];
}

/**
 * Seed ∪ curated : le ledger écrase les champs qu'il pose ; les slugs seed
 * absents du ledger restent en stub.
 */
export function mergeLeclercSealedSeedWithLedger(
  setCode: string,
  ledgerProducts: readonly LeclercSealedSkuDraft[] | null | undefined,
): LeclercSealedSkuDraft[] {
  const bySlug = new Map(
    leclercSealedSeedProducts(setCode).map((sku) => [sku.slug, sku]),
  );
  for (const row of ledgerProducts ?? []) {
    const slug = row.slug?.trim();
    if (!slug) continue;
    const base = bySlug.get(slug);
    bySlug.set(slug, base ? { ...base, ...row, slug } : { ...row, slug });
  }
  const seedOrder = LECLERC_SEALED_SEED_SLUGS as readonly string[];
  const ordered: LeclercSealedSkuDraft[] = [];
  const seen = new Set<string>();
  for (const slug of seedOrder) {
    const sku = bySlug.get(slug);
    if (sku) {
      ordered.push(sku);
      seen.add(slug);
    }
  }
  for (const [slug, sku] of bySlug) {
    if (!seen.has(slug)) ordered.push(sku);
  }
  return ordered;
}
