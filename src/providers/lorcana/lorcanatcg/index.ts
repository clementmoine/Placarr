import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { parsePrintKey } from "@/core/identify/printKey";
import { withPackCardUrls } from "@/effects/lorcana/packAssets";
import type {
  MetadataResult,
  MetadataAttachment,
} from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  PrintCandidate,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { labelFromPrintSetOptions } from "@/providers/shared/cardCatalogue/labelPrintSet";
import { mergePrintSetOptions } from "@/providers/shared/cardCatalogue/sets";
import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import type { BoosterCompositionFile } from "@/providers/shared/sealedProducts/boosterComposition";
import {
  cardFromLocalRow,
  toPrintCandidate,
} from "@/providers/lorcana/lorcanajson";
import {
  fetchLorcanaCardByPrintKey,
  isLorcanaLanguage,
  listLorcanaPrintSets,
  searchLorcanaCards,
} from "@/providers/lorcana/lorcanajson/fetch";
import lorcanaBoosterComposition from "@/providers/lorcana/lorcanajson/curated/booster-composition.json";

import {
  ensureLorcanaTcgIndex,
  listLorcanaTcgSets,
  lookupLorcanaTcgPrint,
  lookupLorcanaTcgSearchRow,
  lookupLorcanaTcgTitle,
  lorcanaTcgDbPath,
  searchLorcanaTcgRows,
} from "./indexStore";
import { lorcanatcgCatalog } from "./pipeline";
import {
  ensureLorcanaSetLogoIndex,
  loadLorcanaSetLogoIndex,
  lorcanaCatalogueSetIdForProduct,
  lorcanaLogoUrlForSet,
} from "./sources/setLogos";

export {
  exportLorcanaCardsIndexJson,
  writeLorcanaTcgIndex,
  lorcanaTcgDbPath,
  lookupLorcanaTcgTitle,
  lookupLorcanaTcgPrint,
  ensureLorcanaTcgIndex,
} from "./indexStore";

export { scrapeLorcanaCards } from "./scrape/cards";

const PROVIDER_ID = "lorcanatcg";
const PROVIDER_LABEL = "Lorcana TCG (local)";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (!ensureLorcanaTcgIndex()) return null;

  const title =
    lookupLorcanaTcgTitle(printKey, "fr") ??
    lookupLorcanaTcgTitle(printKey, "en") ??
    lookupLorcanaTcgTitle(printKey, "de") ??
    lookupLorcanaTcgTitle(printKey, "it");
  if (!title) return null;
  const print = lookupLorcanaTcgPrint(printKey);

  const withUrls = withPackCardUrls({
    printKey,
    language: title.lang,
    imageUrl: null,
    thumbnailUrl: null,
    foilMaskUrl: null,
    varnishMaskUrl: null,
    secondVarnishMaskUrl: null,
  });

  const attachments: MetadataAttachment[] = [];
  if (withUrls.imageUrl) {
    attachments.push({
      type: "cover",
      url: withUrls.imageUrl,
      title: title.fullName,
      role: "lorcanatcg-art",
      source: PROVIDER_ID,
    });
  }

  const authors = (print?.artists ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  return {
    title: title.fullName,
    description: title.flavorText ?? undefined,
    imageUrl: withUrls.imageUrl ?? undefined,
    attachments: attachments.length ? attachments : undefined,
    authors: authors.length ? authors : undefined,
    publishers: [{ name: "Ravensburger" }],
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
      ...(print?.providerId ? { lorcanaProviderId: print.providerId } : {}),
    },
  };
}

export const lorcanatcgModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Lorcana",
    catalogueAliases: ["Disney Lorcana", "Lorcana TCG"],
    types: ["tcg"],
    nameDatabase: true,
    capabilities: ["identify", "cover", "description", "people"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    catalogLifecycle: "living",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://cards.disneylorcana.com/",
    notes:
      "Owner catalogue Lorcana (picker + check-list + scellés) → `data/lorcana/catalog.sqlite` + foil. Repli distant LorcanaJSON tant que Sync n'a pas peuplé l'index. `lorcanajson` = enrich metadata / masques API seulement. Sync : Catalogue Extract. Produits scellés : lorcards.fr + `www.disneylorcana.com`. Dump app/Unity = cette source.",
  },
  catalog: lorcanatcgCatalog,
  /*
    Les logos vivent dans ce provider ; l'ingest scellé les demande plutôt que
    d'aller les chercher lui-même. Le relevé est lu à chaque appel — il est mis
    en cache en mémoire par `loadLorcanaSetLogoIndex`.
  */
  refreshSetLogos: async ({ force, offline }) => {
    const logos = offline
      ? loadLorcanaSetLogoIndex()
      : await ensureLorcanaSetLogoIndex({ force });
    if (!logos && offline) return "lorcana set logos : indisponible";

    if (!offline) {
      const { harvestOfficialLorcanaSite } = await import("./scrape/officialSite");
      const { applyOfficialSiteLogos } = await import("./scrape/officialSiteApply");
      const harvested = await harvestOfficialLorcanaSite({
        force,
        onProgress: (message) => console.log(`   official — ${message}`),
      });
      console.log(
        `── official site — ${harvested.pages} pages, ${harvested.logos} logos, ${harvested.packshots} packshots`,
      );
      const applied = applyOfficialSiteLogos({ index: logos });
      const next = applied.index ?? loadLorcanaSetLogoIndex();
      const withLogo = next?.sets.filter((row) => row.logo).length ?? 0;
      return `lorcana set logos : ${withLogo} (API+officiel, +${applied.added} sets) / ${next?.sets.length ?? 0} sets`;
    }

    const withLogo = logos!.sets.filter((row) => row.logo).length;
    return `lorcana set logos : ${withLogo} thumbs / ${logos!.sets.length} sets`;
  },
  /*
    La boutique dit `ROTF`, le catalogue dit `2`. La correspondance est la même
    que celle qui choisit le logo — on la déclare au lieu de la laisser deviner
    à qui lirait l'URL de l'image.
  */
  resolveCatalogueSetId: ({ setCode, slug, name }) =>
    lorcanaCatalogueSetIdForProduct({
      setCode,
      slug,
      name,
      index: loadLorcanaSetLogoIndex(),
    }),
  /*
    Seul owner checklist / picker Lorcana. Index local d'abord ; JSON distant
    en repli tant qu'aucune Sync n'a peuplé `catalog.sqlite`.
  */
  listPrintLanguages: () => distinctPrintLanguages(lorcanaTcgDbPath()),
  labelPrintSet: ({ setCode, language }) =>
    labelFromPrintSetOptions(
      listLorcanaTcgSets(language ?? undefined),
      setCode,
    ),
  listPrintSets: async (_type, language) => {
    const local = listLorcanaTcgSets(language ?? undefined);
    const remote = await listLorcanaPrintSets();
    return mergePrintSetOptions(local, remote);
  },
  loadBoosterComposition: () => {
    const raw = lorcanaBoosterComposition as BoosterCompositionFile;
    return raw?.version === 1 ? raw : null;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const local = searchLorcanaTcgRows(cleanedName, { limit: 10 });
    if (local.length > 0) {
      return Array.from(
        new Set(local.map((row) => cardFromLocalRow(row).fullName)),
      );
    }
    const cards = await searchLorcanaCards(cleanedName, { limit: 10 });
    return Array.from(new Set(cards.map((card) => card.fullName)));
  },
  searchPrints: async ({
    query,
    language,
    limit,
    signal,
    setId,
    catalogueBrowse,
  }): Promise<PrintCandidate[]> => {
    const rows = searchLorcanaTcgRows(query, {
      language: language ?? undefined,
      limit,
      setId,
      catalogueBrowse,
    });
    if (rows.length > 0) {
      const seen = new Set<string>();
      const out: PrintCandidate[] = [];
      for (const row of rows) {
        if (seen.has(row.printKey)) continue;
        seen.add(row.printKey);
        out.push(toPrintCandidate(cardFromLocalRow(row)));
        if (limit && out.length >= limit) break;
      }
      return out;
    }
    const cards = await searchLorcanaCards(query, {
      language: isLorcanaLanguage(language) ? language : undefined,
      limit,
      signal,
      setId,
    });
    return cards.map((card) => toPrintCandidate(card));
  },
  lookupPrint: async ({ printKey, name, language, signal }) => {
    if (parsePrintKey(printKey)?.game !== "lorcana") return null;
    const row = lookupLorcanaTcgSearchRow(printKey, {
      language: language ?? undefined,
    });
    if (row) return toPrintCandidate(cardFromLocalRow(row));
    const card = await fetchLorcanaCardByPrintKey(printKey, {
      language: isLorcanaLanguage(language) ? language : undefined,
      name,
      signal,
    });
    return card ? toPrintCandidate(card) : null;
  },
  listSetPrints: async ({ setId, language, includeUnprinted }) =>
    /*
      Lorcana corpus is cardboard-only today — `includeUnprinted` is a no-op
      until a non-physical channel lands with `printed: false` stamps.
    */
    enumerateSetPrints({
      setId,
      language,
      includeUnprinted,
      search: (opts) =>
        searchLorcanaTcgRows(opts.query, {
          language: opts.language,
          limit: opts.limit,
          setId: opts.setId,
        }).map((row) => toPrintCandidate(cardFromLocalRow(row))),
    }),
  printGames: ["lorcana"],
  resolveSetLogo: ({ setCode, slug, name }) =>
    lorcanaLogoUrlForSet({
      setCode,
      slug,
      name,
      index: loadLorcanaSetLogoIndex(),
    }),
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  // Local ingest resolves by printKey only — probe the same path.
  mappingProbe: {
    sampleInput: "lorcana:1-1",
    context: { printKey: "lorcana:1-1" },
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const db = ensureLorcanaTcgIndex();
      return {
        ok: Boolean(db),
        latency: Date.now() - start,
        error: db
          ? null
          : `Index unavailable — run Catalogue Sync for Lorcana (${lorcanaTcgDbPath()})`,
        configured: true,
      };
    },
  ),
});
