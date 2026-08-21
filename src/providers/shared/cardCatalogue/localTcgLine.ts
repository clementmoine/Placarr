/**
 * Ligne TCG locale — le boilerplate commun aux catalogues qui existent
 * comme onglet, parfois avant d'avoir une seule carte.
 *
 * Ce qui change d'une ligne à l'autre (id, pack, dos, notes) reste chez le
 * provider. Ce qui ne change pas : schéma, recherche, sonde, santé.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { parsePrintKey } from "@/core/identify/printKey";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import { assetsPackFileUrl } from "@/lib/packAssetUrls";
import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import type {
  PrintCandidate,
  ProviderCatalogHooks,
  ProviderModule,
} from "@/types/providerModule";

import {
  createLocalPrintsIndex,
  type LocalPrintSearchRow,
  type LocalPrintsIndex,
} from "./localPrintsIndex";

export type LocalTcgLineSpec = {
  providerId: string;
  providerLabel: string;
  catalogueLabel: string;
  factLabel: string;
  packId: string;
  effectPackId: string;
  printGame: string;
  notes: string;
  defaultLanguage: "fr" | "en" | "unknown";
  /** Ce que dit le health-check si la base n'est pas encore là. */
  syncHint: string;
  websiteUrl?: string;
  formatReference?: (cardType: string, number: string) => string;
  setLabel?: (setCode: string) => string;
  setSortKey?: (setCode: string) => number | null;
};

export type LocalTcgLine = {
  spec: LocalTcgLineSpec;
  index: LocalPrintsIndex;
  /** Catalogue hooks à poser par le pack — son CLI, pas un import circulaire. */
  attachCatalog: (catalog: ProviderCatalogHooks) => ProviderModule;
  searchPrints: (
    query: string,
    opts?: { language?: string; limit?: number; setId?: string | null },
  ) => PrintCandidate[];
  lookupPrint: (printKey: string) => PrintCandidate | null;
  curatedDir: () => string;
};

function defaultReference(cardType: string, number: string): string {
  const digits = number.replace(/^[a-z]+/i, "").replace(/^0+/, "");
  const prefix = cardType.trim().toUpperCase();
  return `${prefix}-${digits || number}`;
}

function toCandidate(
  spec: LocalTcgLineSpec,
  row: LocalPrintSearchRow,
): PrintCandidate {
  const format = spec.formatReference ?? defaultReference;
  const reference = format(row.cardType, row.number);
  const art = row.art
    ? assetsPackFileUrl(
        spec.packId,
        "cards",
        row.cardType.trim().toLowerCase(),
        row.number.trim().toLowerCase(),
        row.lang.trim().toLowerCase(),
        row.art,
      )
    : null;
  const thumb = row.thumb
    ? assetsPackFileUrl(
        spec.packId,
        "cards",
        row.cardType.trim().toLowerCase(),
        row.number.trim().toLowerCase(),
        row.lang.trim().toLowerCase(),
        row.thumb,
      )
    : null;
  const setLabel =
    spec.setLabel ?? ((code: string) => code.trim().toUpperCase());
  return {
    printKey: row.printKey,
    title: row.fullName?.trim() || reference,
    reference,
    setLabel: setLabel(row.setCode),
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(art ? { imageUrl: art } : {}),
    ...(thumb ? { thumbnailUrl: thumb } : {}),
    language: row.lang,
    printed: true,
    effectPack: spec.effectPackId,
  };
}

export function createLocalTcgLine(spec: LocalTcgLineSpec): LocalTcgLine {
  const index = createLocalPrintsIndex(spec.packId);

  const searchPrints = (
    query: string,
    opts: { language?: string; limit?: number; setId?: string | null } = {},
  ): PrintCandidate[] => {
    const rows = index.searchRows(query, opts);
    const seen = new Set<string>();
    const out: PrintCandidate[] = [];
    for (const row of rows) {
      if (seen.has(row.printKey)) continue;
      seen.add(row.printKey);
      out.push(toCandidate(spec, row));
      if (opts.limit && out.length >= opts.limit) break;
    }
    return out;
  };

  const lookupPrint = (printKey: string): PrintCandidate | null => {
    const parsed = parsePrintKey(printKey);
    if (parsed?.game !== spec.printGame) return null;
    const row = index.lookupRow(printKey);
    return row ? toCandidate(spec, row) : null;
  };

  const curatedDir = () =>
    path.join(process.cwd(), "src", "providers", spec.providerId, "curated");

  const module: ProviderModule = {
    info: {
      id: spec.providerId,
      label: spec.providerLabel,
      catalogueLabel: spec.catalogueLabel,
      factLabel: spec.factLabel,
      types: ["tcg"],
      capabilities: ["identify", "cover"],
      nameDatabase: true,
      auth: { kind: "none" },
      supplyMode: "local_catalog",
      canonical: false,
      defaultLanguage: spec.defaultLanguage,
      ...(spec.websiteUrl ? { websiteUrl: spec.websiteUrl } : {}),
      notes: spec.notes,
    },
    evidence: {
      label: spec.providerLabel,
      sourceWeight: 0.9,
    },
    suggestDatabaseTitles: async ({ cleanedName }) => {
      const cards = searchPrints(cleanedName, { limit: 10 });
      return Array.from(new Set(cards.map((card) => card.title)));
    },
    /*
      Lues dans la base : un catalogue vide n'annonce aucune langue, donc le
      filtre n'a rien à cacher. Le jour où une moisson pose des titres FR, le
      japonais le retirera tout seul.
    */
    listPrintLanguages: () => distinctPrintLanguages(index.dbPath()),
    printGames: [spec.printGame],
    listPrintSets: () =>
      index.listSets({
        setLabel: spec.setLabel,
        setSortKey: spec.setSortKey,
      }),
    listSetPrints: ({ setId, language }) =>
      enumerateSetPrints({
        setId,
        language,
        search: (opts) => searchPrints(opts.query, opts),
      }),
    searchPrints: async ({ query, language, limit, setId }) =>
      searchPrints(query, {
        language: language ?? undefined,
        limit,
        setId,
      }),
    lookupPrint: async ({ printKey }) => lookupPrint(printKey),
    runMappingProbe: async () => metadataProbe(lookupPrint("")),
    mappingProbe: {
      sampleInput: spec.packId,
      context: {},
    },
    testHandlers: {
      [`${spec.providerId}-search`]: {
        label: `${spec.catalogueLabel} - Recherche`,
        kind: "metadata",
        run: (query) => Promise.resolve(searchPrints(query, { limit: 10 })),
      },
      [`${spec.providerId}-printkey`]: {
        label: `${spec.catalogueLabel} - Clé de tirage`,
        kind: "metadata",
        run: (query) => Promise.resolve(lookupPrint(query)),
      },
    },
    healthCheck: createMetadataHealthCheck(
      spec.providerId,
      spec.providerLabel,
      async () => {
        const start = Date.now();
        const dbPath = index.dbPath();
        const ok = existsSync(dbPath) && Boolean(index.ensure());
        return {
          ok,
          latency: Date.now() - start,
          error: ok ? null : `Catalogue absent — ${spec.syncHint} (${dbPath})`,
          configured: true,
        };
      },
    ),
  };

  return {
    spec,
    index,
    attachCatalog: (catalog) => ({ ...module, catalog }),
    searchPrints,
    lookupPrint,
    curatedDir,
  };
}
