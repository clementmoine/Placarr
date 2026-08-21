import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
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
import { existsSync } from "node:fs";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { parsePrintKey } from "@/core/identify/printKey";
import type { ProviderModule } from "@/types/providerModule";

import {
  ensureNarutoShippudenIndex,
  listNarutoShippudenSets,
  narutoShippudenDbPath,
} from "./indexStore";
import { narutoShippudenCatalog } from "./pipeline";
import {
  lookupNarutoShippudenPrint,
  searchNarutoShippudenPrints,
} from "./searchPrints";

const PROVIDER_ID = "narutoshippuden";
const PROVIDER_LABEL = "Naruto 疾風伝 (local)";

/** Le slug de jeu des `printKey`, partagé avec le Carddass — même franchise. */
const NARUTO_GAME = "naruto";

/** Sonde : うずまきナルト, 忍伝-1, la première carte du premier acte. */
const PROBE_PRINT_KEY = "naruto:shi-0001";

export const narutoshippudenModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Naruto 疾風伝",
    factLabel: "Naruto 疾風伝",
    types: ["tcg"],
    capabilities: ["identify", "cover"],
    nameDatabase: true,
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    canonical: false,
    /*
      Le contrat ne connaît que `en`, `fr` et `unknown` : ce jeu n'est sorti
      qu'en japonais, ce qu'aucune de ces trois valeurs ne dit. `unknown` est
      le moins faux — prétendre `fr` ou `en` inviterait à chercher des titres
      qui n'ont jamais existé.
    */
    defaultLanguage: "unknown",
    notes:
      "Jeu 疾風伝 (2007-2009), japonais seul → `data/naruto/shippuden/`. Familles 忍伝 / 術伝 / 作伝 / 忍伝-学. **Huit actes sortis** (le scellé les atteste tous) ; le catalogue de cartes n'en tient que quatre, les listes officielles moissonnées s'arrêtant au 第四幕. Distinct du Carddass et du CCG anglais. Catalogue migré depuis le pack Carddass.",
  },
  catalog: narutoShippudenCatalog,
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.9,
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = searchNarutoShippudenPrints(cleanedName, { limit: 10 });
    return Array.from(new Set(cards.map((card) => card.title)));
  },
  /*
    Japonais seul, et c'est un fait sur le **jeu**, pas sur nos données : Bandai
    ne l'a jamais édité hors du Japon. Sans cette ligne, choisir « français »
    laissait son en-tête dans le sélecteur, vide, comme s'il y avait quelque
    chose dessous.
  */
  listPrintLanguages: () => ["ja"],
  listPrintSets: () => listNarutoShippudenSets(),
  listSetPrints: ({ setId, language }) =>
    enumerateSetPrints({
      setId,
      language,
      search: (opts) => searchNarutoShippudenPrints(opts.query, opts),
    }),
  searchPrints: async ({ query, language, limit, setId }) =>
    searchNarutoShippudenPrints(query, {
      language: language ?? undefined,
      limit,
      setId,
    }),
  lookupPrint: async ({ printKey }) => {
    /*
      Les deux jeux Naruto partagent le slug `naruto` dans leurs clés — même
      franchise — donc le jeu ne suffit pas à les départager. C'est la
      **famille** qui tranche : `shi`, `mju`, `msa` et `gaku` sont à celui-ci,
      `ni`, `te`, `ta`, `cl`, `ki` au Carddass.
    */
    if (parsePrintKey(printKey)?.game !== NARUTO_GAME) return null;
    return lookupNarutoShippudenPrint(printKey);
  },
  /** うずまきナルト, première carte du premier acte — toujours en base. */
  runMappingProbe: async () =>
    metadataProbe(lookupNarutoShippudenPrint(PROBE_PRINT_KEY)),
  mappingProbe: {
    sampleInput: PROBE_PRINT_KEY,
    context: { printKey: PROBE_PRINT_KEY },
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const dbPath = narutoShippudenDbPath();
      const ok = existsSync(dbPath) && Boolean(ensureNarutoShippudenIndex());
      return {
        ok,
        latency: Date.now() - start,
        error: ok
          ? null
          : `Catalogue absent — migrer depuis Carddass (${dbPath})`,
        configured: true,
      };
    },
  ),
};

export {
  NARUTO_SHIPPUDEN_PACK_ID,
  narutoShippudenDbPath,
  ensureNarutoShippudenIndex,
} from "./indexStore";
