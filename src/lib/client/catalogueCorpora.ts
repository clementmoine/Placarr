/**
 * Admin Catalogue — refresh local corpora via ProviderModule.catalog
 * (provider-blind: discovered from registry on the server).
 */

export type CatalogueCorpusLastGrowth = {
  cards?: number;
  products?: number;
  sets?: number;
  cardsDelta?: number;
  productsDelta?: number;
  setsDelta?: number;
  addedSets?: string[];
};

export type CatalogueCorpusStatus = {
  empty: boolean;
  stale: boolean;
  lastSyncAt: string | null;
  /** Counts from the last Sync that reported them (autonomie signal). */
  lastGrowth?: CatalogueCorpusLastGrowth | null;
};

export type CatalogueIdentifyIndexStatus = {
  visualEntries: number;
  embeddingEntries: number;
  embeddingModel: string | null;
  embeddingsStale: boolean;
  hasVisual: boolean;
};

export type CatalogueCorpusRow = {
  providerId: string;
  label: string;
  dataPack: string;
  supplyMode: string;
  status: CatalogueCorpusStatus;
  /** Declared harvest steps when the pack supports targeted refresh. */
  pipelineSteps?: string[] | null;
  /** Camera identify indexes on disk (dHash + CLIP) — null if never probed. */
  identifyIndexes?: CatalogueIdentifyIndexStatus | null;
};

export type CatalogueRefreshRequest = {
  providerId?: string;
  all?: boolean;
  auto?: boolean;
  only?: string[] | string;
  skip?: string[] | string;
  langs?: string[] | string;
  limit?: number;
  /** Pokémon CDN breadth when Sync goes through catalog.refresh. */
  extractScope?: "inventory" | "catalogue";
};

export async function fetchCatalogueCorpora(): Promise<CatalogueCorpusRow[]> {
  const res = await fetch("/api/admin/catalogue-corpora", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { corpora?: CatalogueCorpusRow[] };
  return body.corpora ?? [];
}

export async function enqueueCatalogueRefresh(
  opts: CatalogueRefreshRequest,
): Promise<{ jobs: { providerId: string; jobId: string; label: string }[] }> {
  const res = await fetch("/api/admin/catalogue-corpora", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(opts),
  });
  const body = (await res.json()) as {
    error?: string;
    ok?: boolean;
    jobs?: { providerId: string; jobId: string; label: string }[];
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return { jobs: body.jobs ?? [] };
}
