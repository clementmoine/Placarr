/**
 * Scellés Naruto Card Game (Bandai 2027) — curated sous
 * `curated/products/…`, index dans `data/naruto/cardgame/`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { writeLocalSealedProducts } from "@/providers/shared/sealedProducts/localWrite";
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import type { PackCompositionField } from "@/providers/shared/sealedProducts/packCompositionTypes";

import {
  NARUTO_CARDGAME_LAUNCH_SET,
  narutoCardgameSetLabel,
} from "./printKey";
import { NARUTO_CARDGAME_PACK_ID } from "./pack";
import { narutoCardgameCuratedDir } from "./curatedPaths";
import { narutoCardgameSourcePath } from "./syncedSources";

export type NarutoCardgameSealedSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  art?: string | null;
  back?: string | null;
  lang?: string;
  setCode?: string;
  releaseDate?: string | null;
  declaredCardCount?: number | null;
  cardsPerPack?: number | null;
  packsContained?: number | null;
  priceCents?: number | null;
  packComposition?: PackCompositionField;
  /** Page boutique / preuve (Pixel Heart, …). */
  path?: string;
};

export type NarutoCardgameSealedLedger = {
  sourceId: string;
  lang: string;
  setCode: string;
  products: NarutoCardgameSealedSku[];
};

export function narutoCardgameSealedLedgerPath(): string {
  return narutoCardgameSourcePath("naruto-cardgame-sealed.json");
}

export function readNarutoCardgameSealedLedger(): NarutoCardgameSealedLedger | null {
  const file = narutoCardgameSealedLedgerPath();
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as NarutoCardgameSealedLedger;
}

function curatedFile(
  slug: string,
  lang: string,
  filename: string | null | undefined,
): string | null {
  const name = filename?.trim();
  if (!name) return null;
  const dest = path.join(
    narutoCardgameCuratedDir(),
    "products",
    slug,
    lang,
    name,
  );
  return existsSync(dest) ? dest : null;
}

/** Seed minimal : display launch FR (Pixel Heart) tant que le corpus cartes est vide. */
export function narutoCardgameSealedSeedProducts(): NarutoCardgameSealedSku[] {
  const title = narutoCardgameSetLabel(NARUTO_CARDGAME_LAUNCH_SET);
  return [
    {
      slug: "display-launch-fr",
      kind: "display",
      category: "displays",
      name: `Display — ${title} (FR)`,
      art: "art.pixelheart.webp",
      lang: "fr",
      setCode: NARUTO_CARDGAME_LAUNCH_SET,
      releaseDate: "2027-07",
      declaredCardCount: null,
      cardsPerPack: null,
      packsContained: null,
      priceCents: 17999,
      path: "https://www.pixelheart.eu/fr/produit/naruto-card-game-by-bandai-worldwide-launch-summer-2027-francais/",
    },
  ];
}

function mergeSeedWithLedger(
  ledger: NarutoCardgameSealedLedger | null,
): { lang: string; source: string; products: NarutoCardgameSealedSku[] } {
  const seed = narutoCardgameSealedSeedProducts();
  const bySlug = new Map(seed.map((sku) => [sku.slug, sku]));
  for (const row of ledger?.products ?? []) {
    const slug = row.slug?.trim();
    if (!slug) continue;
    const base = bySlug.get(slug);
    bySlug.set(slug, base ? { ...base, ...row, slug } : { ...row, slug });
  }
  return {
    lang: (ledger?.lang ?? "fr").trim().toLowerCase() || "fr",
    source: ledger?.sourceId?.trim() || "pixelheart",
    products: [...bySlug.values()],
  };
}

export function ingestNarutoCardgameSealedProducts(): {
  written: number;
  skipped: number;
  file: string | null;
} {
  const ledger = readNarutoCardgameSealedLedger();
  const { lang: defaultLang, source, products: drafts } =
    mergeSeedWithLedger(ledger);

  const products = drafts.map((sku) => {
    const lang = (sku.lang ?? defaultLang).trim().toLowerCase() || "fr";
    return {
      slug: sku.slug,
      kind: sku.kind,
      category: sku.category,
      name: sku.name,
      setCode: sku.setCode ?? NARUTO_CARDGAME_LAUNCH_SET,
      lang,
      releaseDate: sku.releaseDate ?? null,
      declaredCardCount: sku.declaredCardCount ?? null,
      cardsPerPack: sku.cardsPerPack ?? null,
      packsContained: sku.packsContained ?? null,
      priceCents: sku.priceCents ?? null,
      path: sku.path,
      ...(sku.packComposition !== undefined
        ? { packComposition: sku.packComposition }
        : {}),
      artPath: curatedFile(sku.slug, lang, sku.art),
      imageBackPath: curatedFile(sku.slug, lang, sku.back),
    };
  });

  const result = writeLocalSealedProducts({
    packId: NARUTO_CARDGAME_PACK_ID,
    source,
    products,
    allowMissingArt: true,
  });
  return {
    written: result.written,
    skipped: result.skipped,
    file: result.file,
  };
}
