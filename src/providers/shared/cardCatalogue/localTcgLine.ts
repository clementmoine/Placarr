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
import {
  assetsCardUrl,
  type CardDiskId,
} from "@/lib/packAssetUrls";
import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { artOrientationForPackPrint } from "@/providers/shared/cardCatalogue/cardsIndexOrientation";
import type { MetadataResult } from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
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
  /**
   * Autres noms d'étagère pour ce catalogue (voir `ProviderInfo.catalogueAliases`).
   */
  catalogueAliases?: Array<
    string | { label: string; language?: "fr" | "en" | "ja" | "it" | "de" }
  >;
  factLabel: string;
  packId: string;
  effectPackId: string;
  printGame: string;
  notes: string;
  defaultLanguage: "fr" | "en" | "unknown";
  /** Ce que dit le health-check si la base n'est pas encore là. */
  syncHint: string;
  websiteUrl?: string;
  /**
   * Affiche la référence collectionneur. Le 3ᵉ argument (grouping) est
   * optionnel — les lignes Bandai / promo Lorcana le passent. Le 4ᵉ
   * (langue du titre / filtre) laisse un set afficher sa ref locale
   * (ex. Ninja Ranks `BL-1` US vs `GS-1` EU).
   */
  formatReference?: (
    cardType: string,
    number: string,
    grouping?: string | null,
    language?: string | null,
  ) => string;
  setLabel?: (setCode: string, language?: string | null) => string;
  setSortKey?: (setCode: string) => number | null;
  /**
   * Traduit une requête utilisateur avant la recherche SQL (ex. référence
   * imprimée `忍伝-43` → id disque `shi0043`).
   */
  normalizeSearchQuery?: (query: string) => string;
  /**
   * Langues listées dans le sélecteur. Défaut : ce que la base contient
   * réellement (`distinctPrintLanguages`).
   */
  listPrintLanguages?: () => string[];
  /** Langues déclarées sur chaque set (ex. jeu JA-only → `["ja"]`). */
  listSetLanguages?: readonly string[];
  /**
   * Langue préférée pour le ORDER BY de recherche. Défaut : `defaultLanguage`
   * quand c'est `en`/`fr`, sinon `fr`.
   */
  searchPreferLanguage?: string;
  /**
   * URL face sous `/assets/…/cards/…`. Défaut : {@link assetsCardUrl}
   * (`{set}/{lang}/{card}/`). Override pour les arbres Carddass-like
   * (`{set}/{card}/{lang}/`, ex. 疾風伝).
   */
  cardAssetUrl?: (id: CardDiskId, file: string) => string;
  /**
   * Si le titre n'a pas de scan dans sa langue, emprunter une face d'une
   * autre locale (comme Catalogue `bestFaceAcrossLocales`).
   */
  borrowFaceAcrossLocales?: boolean;
  /**
   * Post-process a candidate after disk faces are resolved (e.g. OPTCG
   * category sleeve backs). Default: identity.
   */
  decorateCandidate?: (
    candidate: PrintCandidate,
    row: LocalPrintSearchRow,
  ) => PrintCandidate;
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
  lookupPrint: (
    printKey: string,
    language?: string | null,
  ) => PrintCandidate | null;
  curatedDir: () => string;
};

function defaultReference(
  cardType: string,
  number: string,
  grouping?: string | null,
): string {
  const digits = number.replace(/^[a-z]+/i, "").replace(/^0+/, "");
  const prefix = cardType.trim().toUpperCase();
  const base = `${prefix}-${digits || number}`;
  const group = grouping?.trim();
  return group ? `${base}_${group.toUpperCase()}` : base;
}

function faceUrl(
  spec: LocalTcgLineSpec,
  id: CardDiskId,
  file: string,
): string {
  return (spec.cardAssetUrl ?? ((diskId, name) => assetsCardUrl(spec.packId, diskId, name)))(
    id,
    file,
  );
}

function resolveFaceFiles(
  index: LocalPrintsIndex,
  spec: LocalTcgLineSpec,
  row: LocalPrintSearchRow,
): {
  diskLang: string;
  art: string | null;
  thumb: string | null;
  back: string | null;
} {
  if (row.art || row.thumb || row.back) {
    return {
      diskLang: row.lang?.trim().toLowerCase(),
      art: row.art,
      thumb: row.thumb,
      back: row.back,
    };
  }
  if (!spec.borrowFaceAcrossLocales) {
    return {
      diskLang: row.lang?.trim().toLowerCase(),
      art: null,
      thumb: null,
      back: null,
    };
  }
  const borrowed = index.lookupAssets(row.printKey, {
    preferLang: row.lang,
  });
  if (!borrowed) {
    return {
      diskLang: row.lang?.trim().toLowerCase(),
      art: null,
      thumb: null,
      back: null,
    };
  }
  return {
    diskLang: borrowed.lang?.trim().toLowerCase(),
    art: borrowed.art,
    thumb: borrowed.thumb,
    back: borrowed.back,
  };
}

function toCandidate(
  spec: LocalTcgLineSpec,
  index: LocalPrintsIndex,
  row: LocalPrintSearchRow,
): PrintCandidate {
  const format = spec.formatReference ?? defaultReference;
  const reference = format(
    row.cardType,
    row.number,
    row.grouping,
    row.lang,
  );
  const set = row.cardType.trim().toLowerCase();
  const card = row.grouping?.trim()
    ? `${row.number.trim().toLowerCase()}-${row.grouping.trim().toLowerCase()}`
    : row.number.trim().toLowerCase();
  const faces = resolveFaceFiles(index, spec, row);
  const diskId: CardDiskId = { set, lang: faces.diskLang, card };
  const art = faces.art ? faceUrl(spec, diskId, faces.art) : null;
  const thumb = faces.thumb ? faceUrl(spec, diskId, faces.thumb) : null;
  const back = faces.back ? faceUrl(spec, diskId, faces.back) : null;
  const setLabel =
    spec.setLabel ?? ((code: string) => code.trim().toUpperCase());
  const orient = artOrientationForPackPrint(
    spec.packId,
    row.printKey,
    row.lang,
  );
  return {
    printKey: row.printKey,
    title: row.fullName?.trim() || reference,
    reference,
    setLabel: setLabel(row.setCode, row.lang),
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(art ? { imageUrl: art } : {}),
    ...(thumb ? { thumbnailUrl: thumb } : {}),
    ...(back ? { cardBackUrl: back } : {}),
    language: row.lang,
    printed: true,
    effectPack: spec.effectPackId,
    ...(orient?.landscapeFace ? { landscapeFace: true } : {}),
    ...(orient?.faceQuarterTurns
      ? { faceQuarterTurns: orient.faceQuarterTurns }
      : {}),
    ...(orient?.landscapePrint ? { landscapePrint: true } : {}),
  };
}

function candidateForRow(
  spec: LocalTcgLineSpec,
  index: LocalPrintsIndex,
  row: LocalPrintSearchRow,
): PrintCandidate {
  const base = toCandidate(spec, index, row);
  return spec.decorateCandidate ? spec.decorateCandidate(base, row) : base;
}

export function createLocalTcgLine(spec: LocalTcgLineSpec): LocalTcgLine {
  const index = createLocalPrintsIndex(spec.packId);
  const preferLang =
    spec.searchPreferLanguage ??
    (spec.defaultLanguage === "unknown" ? "fr" : spec.defaultLanguage);

  const searchPrints = (
    query: string,
    opts: { language?: string; limit?: number; setId?: string | null } = {},
  ): PrintCandidate[] => {
    const normalized = spec.normalizeSearchQuery?.(query) ?? query;
    const rows = index.searchRows(normalized, {
      ...opts,
      language: opts.language ?? preferLang,
    });
    const seen = new Set<string>();
    const out: PrintCandidate[] = [];
    for (const row of rows) {
      if (seen.has(row.printKey)) continue;
      seen.add(row.printKey);
      out.push(candidateForRow(spec, index, row));
      if (opts.limit && out.length >= opts.limit) break;
    }
    return out;
  };

  const lookupPrint = (
    printKey: string,
    language?: string | null,
  ): PrintCandidate | null => {
    const parsed = parsePrintKey(printKey);
    if (parsed?.game !== spec.printGame) return null;
    const row = index.lookupRow(printKey, {
      ...(language ? { language } : {}),
    });
    return row ? candidateForRow(spec, index, row) : null;
  };

  /**
   * Bridge print corpus → enrich cover. Same face URL as `lookupPrint` /
   * PrintCandidate — no second path (admin JSON is only a browse projection).
   * Foreign printGame → null (never name-fallback).
   */
  const resolveFromLocal = (
    ctx: MetadataAdapterContext,
  ): MetadataResult | null => {
    const printKey =
      ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
    if (!printKey) return null;
    if (parsePrintKey(printKey)?.game !== spec.printGame) return null;
    const hit = lookupPrint(printKey, null);
    if (!hit?.title?.trim()) return null;
    return {
      title: hit.title.trim(),
      ...(hit.imageUrl ? { imageUrl: hit.imageUrl } : {}),
      externalIds: {
        [spec.providerId]: printKey,
        printKey,
      },
    };
  };

  const curatedDir = () =>
    path.join(process.cwd(), "src", "providers", spec.providerId, "curated");

  const providerModule: ProviderModule = {
    info: {
      id: spec.providerId,
      label: spec.providerLabel,
      catalogueLabel: spec.catalogueLabel,
      ...(spec.catalogueAliases?.length
        ? { catalogueAliases: spec.catalogueAliases }
        : {}),
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
    createMetadataAdapter: () => ({
      id: spec.providerId,
      async resolve(ctx) {
        return resolveFromLocal(ctx);
      },
    }),
    /*
      Lues dans la base : un catalogue vide n'annonce aucune langue, donc le
      filtre n'a rien à cacher. Le jour où une moisson pose des titres FR, le
      japonais le retirera tout seul — sauf override explicite (jeu JA-only).
    */
    listPrintLanguages: () =>
      spec.listPrintLanguages?.() ?? distinctPrintLanguages(index.dbPath()),
    printGames: [spec.printGame],
    listPrintSets: (_type, language) =>
      index.listSets({
        setLabel: (code) =>
          spec.setLabel?.(code, language) ?? code.trim().toUpperCase(),
        setSortKey: spec.setSortKey,
        ...(spec.listSetLanguages ? { languages: spec.listSetLanguages } : {}),
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
    lookupPrint: async ({ printKey, language }) =>
      lookupPrint(printKey, language),
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
    attachCatalog: (catalog) => ({ ...providerModule, catalog }),
    searchPrints,
    lookupPrint,
    curatedDir,
  };
}
