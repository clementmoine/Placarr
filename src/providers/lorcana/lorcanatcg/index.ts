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
import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import {
  cardFromLocalRow,
  toPrintCandidate,
} from "@/providers/lorcana/lorcanajson";

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
    types: ["tcg"],
    capabilities: ["identify", "cover", "description", "people"],
    auth: { kind: "none" },
    supplyMode: "local_catalog",
    catalogLifecycle: "living",
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://cards.disneylorcana.com/",
    notes:
      "Ingest officiel local → `data/lorcana/catalog.sqlite` (titres + facts FR/EN/DE/IT, URLs) + foil assets. `lorcanajson` reste le catalogue JSON tiers. Sync : Catalogue Extract (admin / worker). Produits scellés : lorcards.fr + complément `www.disneylorcana.com` (logos wordmark + SKU manquants). Dump app/Unity = cette source (`lorcanatcg`), pas `lorcanajson`.",
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
    Owner du `dataPack` lorcana : picker + check-list scellés lisent la même
    base que `lorcanajson` (qui garde le repli API distant).
  */
  listPrintLanguages: () => distinctPrintLanguages(lorcanaTcgDbPath()),
  listPrintSets: async (_type, language) =>
    listLorcanaTcgSets(language ?? undefined),
  searchPrints: async ({
    query,
    language,
    limit,
    setId,
    catalogueBrowse,
  }): Promise<PrintCandidate[]> => {
    const rows = searchLorcanaTcgRows(query, {
      language: language ?? undefined,
      limit,
      setId,
      catalogueBrowse,
    });
    const seen = new Set<string>();
    const out: PrintCandidate[] = [];
    for (const row of rows) {
      if (seen.has(row.printKey)) continue;
      seen.add(row.printKey);
      out.push(toPrintCandidate(cardFromLocalRow(row)));
      if (limit && out.length >= limit) break;
    }
    return out;
  },
  lookupPrint: async ({ printKey, language }) => {
    if (parsePrintKey(printKey)?.game !== "lorcana") return null;
    const row = lookupLorcanaTcgSearchRow(printKey, {
      language: language ?? undefined,
    });
    return row ? toPrintCandidate(cardFromLocalRow(row)) : null;
  },
  listSetPrints: async ({ setId, language }) =>
    enumerateSetPrints({
      setId,
      language,
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
