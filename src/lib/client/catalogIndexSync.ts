/**
 * Admin local-index sync — enqueue catalog worker job by work kind
 * (not provider id — keeps UI provider-blind).
 *
 * Kind strings mirror `BACKGROUND_WORK_KIND` in workQueue (client-safe copy).
 */

export const CATALOG_INDEX_SYNC_KINDS = [
  "icollectCatalogSync",
  "launchboxIndexSync",
  "nointroIndexSync",
] as const;

export type CatalogIndexSyncKind = (typeof CATALOG_INDEX_SYNC_KINDS)[number];

/** @deprecated Use CatalogIndexSyncKind */
export type CatalogIndexSyncTarget = CatalogIndexSyncKind;

export type CatalogIndexSyncEnqueued = {
  ok: true;
  jobId: string;
  kind: CatalogIndexSyncKind;
  label: string;
  hint?: string;
};

export async function enqueueCatalogIndexSync(
  kind: CatalogIndexSyncKind,
): Promise<CatalogIndexSyncEnqueued> {
  const res = await fetch("/api/admin/catalog-index-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ kind }),
  });

  const body = (await res.json()) as {
    error?: string;
    ok?: boolean;
    jobId?: string;
    kind?: CatalogIndexSyncKind;
    label?: string;
    hint?: string;
  };

  if (!res.ok || !body.ok || !body.jobId) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return {
    ok: true,
    jobId: body.jobId,
    kind: body.kind ?? kind,
    label: body.label ?? kind,
    hint: body.hint,
  };
}
