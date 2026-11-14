/**
 * Page a filtered view without capping `total` at the first filled window.
 *
 * Callers that stop once `offset+limit` matches are kept are honest for the
 * page rows but report a truncated total (e.g. « 77 sans image » while
 * hundreds remain). Always keep counting through the source (up to maxScan).
 */

export type CatalogueOverscanPage<T> = {
  rows: T[];
  total: number;
};

/** Sync source pages (SQL browse, in-memory). */
export function overscanFilterPage<T>(opts: {
  offset: number;
  limit: number;
  maxScan: number;
  fetchPage: (
    offset: number,
    limit: number,
  ) => { rows: readonly T[]; total: number };
  keep: (row: T) => boolean;
  chunk?: number;
}): CatalogueOverscanPage<T> {
  const offset = Math.max(0, Math.floor(opts.offset));
  const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit)));
  const maxScan = Math.max(limit, Math.floor(opts.maxScan));
  const chunk = Math.max(limit, opts.chunk ?? 64);
  const window: T[] = [];
  let matchCount = 0;
  let scanned = 0;
  let sourceTotal = 0;

  while (scanned < maxScan) {
    const page = opts.fetchPage(scanned, chunk);
    sourceTotal = page.total;
    if (!page.rows.length) break;
    for (const row of page.rows) {
      if (!opts.keep(row)) continue;
      if (matchCount >= offset && window.length < limit) {
        window.push(row);
      }
      matchCount += 1;
    }
    scanned += page.rows.length;
    if (scanned >= page.total) break;
  }

  const exhausted = scanned >= sourceTotal || sourceTotal === 0;
  return {
    rows: window,
    total: exhausted
      ? matchCount
      : Math.max(matchCount, offset + window.length),
  };
}

/** Async source pages (price quotes, remote joins). */
export async function overscanFilterPageAsync<T>(opts: {
  offset: number;
  limit: number;
  maxScan: number;
  fetchPage: (
    offset: number,
    limit: number,
  ) =>
    | { rows: readonly T[]; total: number }
    | Promise<{ rows: readonly T[]; total: number }>;
  keep: (row: T) => boolean | Promise<boolean>;
  chunk?: number;
}): Promise<CatalogueOverscanPage<T>> {
  const offset = Math.max(0, Math.floor(opts.offset));
  const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit)));
  const maxScan = Math.max(limit, Math.floor(opts.maxScan));
  const chunk = Math.max(limit, opts.chunk ?? 64);
  const window: T[] = [];
  let matchCount = 0;
  let scanned = 0;
  let sourceTotal = 0;

  while (scanned < maxScan) {
    const page = await opts.fetchPage(scanned, chunk);
    sourceTotal = page.total;
    if (!page.rows.length) break;
    for (const row of page.rows) {
      if (!(await opts.keep(row))) continue;
      if (matchCount >= offset && window.length < limit) {
        window.push(row);
      }
      matchCount += 1;
    }
    scanned += page.rows.length;
    if (scanned >= page.total) break;
  }

  const exhausted = scanned >= sourceTotal || sourceTotal === 0;
  return {
    rows: window,
    total: exhausted
      ? matchCount
      : Math.max(matchCount, offset + window.length),
  };
}
