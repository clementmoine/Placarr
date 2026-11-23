/**
 * Sources publiques des ledgers Leclerc, déclarées par opération (comme
 * `COLLEX_LECLERC_COLLECTIONS`) : la Sync (étape `ledgers`) relit ces pages
 * et (re)produit `data/leclerc/sources/` — rien de ce qui se relit ne vit en
 * `curated/`. Les seules valeurs posées ici sont structurelles (libellés de
 * SKU, contenu d'une pochette) et chacune porte sa citation.
 */
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import type { PackCompositionField } from "@/providers/shared/sealedProducts/packCompositionTypes";

export type LeclercSealedSourceSku = {
  slug: string;
  kind: SealedKind;
  category: string;
  name: string;
  /** Fiche Coleka du SKU : exclue de la checklist ; prix / date lus dessus. */
  colekaItem?: string;
  /** Lire « Prix dans le commerce » sur la fiche (sinon `null`). */
  priceFromColeka?: boolean;
  /** `"checklist"` = nombre d'objets de la checklist produite. */
  declaredCardCount: number | "checklist";
  cardsPerPack?: number;
  packComposition?: PackCompositionField;
  /** Citations des valeurs structurelles déclarées ci-dessus. */
  citations?: Record<string, string>;
};

export type LeclercLedgerSourceSpec = {
  /**
   * `ref` : n° = « Ref. » Coleka. `colekaItemOrder` : rien d'imprimé, n° =
   * ordre des fiches Coleka (contrôlé contre la source de `numbering`).
   */
  numbering: "ref" | "colekaItemOrder";
  numberingSource?: { url: string; note: string };
  /** Compte attendu (`colekaItemOrder`) — sinon rien n'est écrit. */
  expectedCount?: number;
  expectedCountSource?: string;
  /** Fiche album Paninimania (finitions, période, seuil, prix album). */
  paninimania?: string;
  /** Article public d'annonce (période, seuil) quand Paninimania n'a pas l'op. */
  announcement?: string;
  /** Écrire `coleka-cdn-faces.json` → `sets.<set>` (fiches sans « Ref. »). */
  cdnFaces?: boolean;
  sealed?: { sourceId: string; products: readonly LeclercSealedSourceSku[] };
};

const COLEKA_MICROPOPZ =
  "https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc";
/** Article reprenant les visuels officiels E.Leclerc (modalités + planche). */
const MINTINBOX_OFFICIAL =
  "https://www.mintinbox.net/2017/10/23/leclerc-star-wars-micropopz-devoilent-officielement/";
/** Article d'annonce (scan catalogue) : période, 1 figurine / 30 €, 25 figurines. */
const MINTINBOX_ANNOUNCE =
  "https://www.mintinbox.net/2017/10/16/leclerc-star-wars-micropopz/";

export const LECLERC_LEDGER_SOURCES: Readonly<
  Record<string, LeclercLedgerSourceSpec>
> = {
  sw17: {
    numbering: "colekaItemOrder",
    numberingSource: {
      url: MINTINBOX_OFFICIAL,
      note: "Aucun numéro imprimé : 001–025 = ordre de la planche officielle (visuel « pres-micropopz-v5 » de l'article ; rangées de gauche à droite), identique à l'ordre des fiches Coleka i153671→i153695 (contrôle visuel 2026-11-22).",
    },
    expectedCount: 25,
    expectedCountSource: MINTINBOX_ANNOUNCE,
    announcement: MINTINBOX_ANNOUNCE,
    cdnFaces: true,
    sealed: {
      sourceId: "leclerc",
      products: [
        {
          slug: "collector-album",
          kind: "coffret",
          category: "albums",
          name: "Coffret Collector Faucon Millenium — Star Wars MicroPopz",
          colekaItem: `${COLEKA_MICROPOPZ}/coffret-collector_i153696`,
          priceFromColeka: true,
          declaredCardCount: "checklist",
          packComposition: "none",
        },
        {
          slug: "pochette",
          kind: "booster",
          category: "boosters",
          name: "Pochette — Star Wars MicroPopz",
          // Fiche Coleka = packshot ; son « prix » (2 €) contredit l'offre
          // (pochette offerte par tranche de 30 €) → non repris.
          colekaItem: `${COLEKA_MICROPOPZ}/pochette_i761758`,
          declaredCardCount: 1,
          cardsPerPack: 1,
          packComposition: {
            provenance: "structural",
            source:
              "visuel modalités E.Leclerc 2017 (article Mintinbox du 23/10/2017) — « une pochette contenant 1 MicroPopz »",
            verifiedAt: "2026-11-22",
            cardsPerPack: 1,
            slots: [
              {
                id: "figurine",
                count: 1,
                kind: "dedicated",
                rarities: ["figurine"],
              },
            ],
            rarityHits: {},
          },
          citations: {
            cardsPerPack: MINTINBOX_OFFICIAL,
          },
        },
        {
          slug: "lunettes-vr",
          kind: "ephemera",
          category: "accessories",
          name: "Lunettes de réalité virtuelle (cardbox) — Star Wars MicroPopz",
          colekaItem: `${COLEKA_MICROPOPZ}/cardbox-lunettes-vr_i153697`,
          priceFromColeka: true,
          declaredCardCount: 0,
          packComposition: "none",
        },
      ],
    },
  },
  sw19: {
    numbering: "ref",
    paninimania: "https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=6809",
  },
  marvel20: {
    numbering: "ref",
    paninimania: "https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=7013",
  },
};

export function leclercLedgerSourceSpec(
  setCode: string,
): LeclercLedgerSourceSpec | null {
  return LECLERC_LEDGER_SOURCES[setCode.trim().toLowerCase()] ?? null;
}
