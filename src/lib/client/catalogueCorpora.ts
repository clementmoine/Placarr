/**
 * Admin Catalogue — refresh local corpora via ProviderModule.catalog
 * (provider-blind: discovered from registry on the server).
 */

export type CatalogueCorpusStatus = {
  empty: boolean;
  stale: boolean;
  lastSyncAt: string | null;
};

export type CatalogueCorpusRow = {
  providerId: string;
  label: string;
  dataPack: string;
  supplyMode: string;
  status: CatalogueCorpusStatus;
};

export async function fetchCatalogueCorpora(): Promise<CatalogueCorpusRow[]> {
  const res = await fetch("/api/admin/catalogue-corpora", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { corpora?: CatalogueCorpusRow[] };
  return body.corpora ?? [];
}

export async function enqueueCatalogueRefresh(opts: {
  providerId?: string;
  all?: boolean;
  auto?: boolean;
}): Promise<{ jobs: { providerId: string; jobId: string; label: string }[] }> {
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
