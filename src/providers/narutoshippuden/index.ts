/**
 * 「NARUTO-ナルト- 疾風伝 カードゲーム」 — Bandai, 2007-2009, japonais seul.
 *
 * Un jeu **distinct** du Naruto Carddass, longtemps logé dans son pack faute
 * d'un endroit à lui. Ce qui les sépare, mesuré le 2026-08-20 : la maquette
 * (sous-titre latin 忍 SHINOBI / 術 JUTSU / 作 SAKUSEN contre le seul kanji),
 * le pied « BANDAI 2007 », la référence en 忍伝-N, et une numérotation qui
 * repart de 1 — `ni0001` et `shi0001` sont tous deux うずまきナルト.
 *
 * À ne pas confondre avec le « Naruto Shippuden Collectible Card Game »
 * **anglais**, qui est la suite de la localisation américaine du Carddass et
 * reste dans l'autre pack : les deux disent « Shippuden » et n'ont pas une
 * carte en commun.
 */
import { createLocalTcgLine } from "@/providers/shared/cardCatalogue/localTcgLine";
import { metadataProbe } from "@/lib/dev/mappingProbe";

import { NARUTO_SHIPPUDEN_EFFECT_PACK_ID } from "./assets";
import {
  NARUTO_SHIPPUDEN_PACK_ID,
  shippudenActNumber,
  shippudenSetLabel,
} from "./indexStore";
import { narutoShippudenCatalog } from "./pipeline";
import {
  diskIdFromPrintedReference,
  formatShippudenReference,
} from "./searchPrints";

export {
  NARUTO_SHIPPUDEN_PACK_ID,
  narutoShippudenDbPath,
  ensureNarutoShippudenIndex,
} from "./indexStore";
export { narutoShippudenCuratedDir } from "./assets";

const PROVIDER_ID = "narutoshippuden";
/** Sonde : うずまきナルト, 忍伝-1, la première carte du premier acte. */
const PROBE_PRINT_KEY = "naruto:shi-0001";

const line = createLocalTcgLine({
  providerId: PROVIDER_ID,
  providerLabel: "Naruto 疾風伝 (local)",
  catalogueLabel: "Naruto 疾風伝",
  factLabel: "Naruto 疾風伝",
  packId: NARUTO_SHIPPUDEN_PACK_ID,
  effectPackId: NARUTO_SHIPPUDEN_EFFECT_PACK_ID,
  printGame: "naruto",
  defaultLanguage: "unknown",
  searchPreferLanguage: "ja",
  listPrintLanguages: () => ["ja"],
  listSetLanguages: ["ja"],
  syncHint: "migrer depuis Carddass",
  formatReference: formatShippudenReference,
  setLabel: shippudenSetLabel,
  setSortKey: shippudenActNumber,
  normalizeSearchQuery: (query) => diskIdFromPrintedReference(query) ?? query,
  notes:
    "Jeu 疾風伝 (2007-2009), japonais seul → `data/naruto/shippuden/`. Familles 忍伝 / 術伝 / 作伝 / 忍伝-学. **Huit actes sortis** (le scellé les atteste tous) ; le catalogue de cartes n'en tient que quatre, les listes officielles moissonnées s'arrêtant au 第四幕. Distinct du Carddass et du CCG anglais. Catalogue migré depuis le pack Carddass.",
});

export const narutoShippudenLine = line;

/**
 * Le pipeline historique reste la source de vérité des étapes (migration →
 * ledgers → verso → scellés → index). On attache ses hooks au module produit
 * par `createLocalTcgLine`.
 */
export const narutoshippudenModule = {
  ...line.attachCatalog(narutoShippudenCatalog),
  runMappingProbe: async () => metadataProbe(line.lookupPrint(PROBE_PRINT_KEY)),
  mappingProbe: {
    sampleInput: PROBE_PRINT_KEY,
    context: { printKey: PROBE_PRINT_KEY },
  },
};
