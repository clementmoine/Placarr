/**
 * CardNexus sealed products (booster boxes, ETBs, …) for an expansion.
 *
 * `productType` filter is `{ op, values }` per OpenAPI — a bare string is ignored.
 *
 * `externalIds` are Cardmarket / TCGPlayer product ids only — **not** GTINs.
 * Do not project those marketplace ids onto `SealedProductEntry.barcodes`.
 * See `barcodeAudit.ts` (packs still at 0 GTIN need retail / shop digs).
 */

import { cardnexusPost } from "./client";
import { loadExpansionIndex, matchExpansionId } from "./expansions";
import type { CardnexusGameId } from "./games";
import {
  centsFromSealedPrices,
  productSourceUrl,
  type CardnexusExternalIds,
  type CardnexusSealedPrices,
} from "./prices";

export type CardnexusSealedProduct = {
  id: number;
  gameId: string;
  name: string;
  nameSlug: string | null;
  expansionCode: string | null;
  expansionId: number | null;
  productCategory: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  priceCents: number | null;
  languages: string[];
  externalIds: CardnexusExternalIds | null;
};

type SealedHit = {
  id: number;
  gameId: string;
  name: string;
  nameSlug?: string | null;
  imageUrl?: string | null;
  productType?: string | null;
  productCategory?: string | null;
  expansionId?: number | null;
  expansion?: { id?: number; code?: string; name?: string } | null;
  prices?: CardnexusSealedPrices | null;
  languages?: string[];
  externalIds?: CardnexusExternalIds | null;
};

type SearchPage = {
  data?: SealedHit[];
  pagination?: { hasMore?: boolean; nextCursor?: string | null };
};

function toSealed(hit: SealedHit): CardnexusSealedProduct {
  return {
    id: hit.id,
    gameId: hit.gameId,
    name: hit.name,
    nameSlug: hit.nameSlug ?? null,
    expansionCode: hit.expansion?.code ?? null,
    expansionId: hit.expansionId ?? hit.expansion?.id ?? null,
    productCategory: hit.productCategory ?? null,
    imageUrl: hit.imageUrl?.trim() || null,
    sourceUrl: productSourceUrl(hit.id),
    priceCents: centsFromSealedPrices(hit.prices),
    languages: hit.languages ?? [],
    externalIds: hit.externalIds ?? null,
  };
}

/**
 * List sealed SKUs for a CardNexus expansion id (paginated via cursor).
 */
export async function listSealedForExpansionId(
  expansionId: number,
  opts?: {
    gameId?: CardnexusGameId;
    signal?: AbortSignal;
    limit?: number;
  },
): Promise<CardnexusSealedProduct[]> {
  const out: CardnexusSealedProduct[] = [];
  let cursor: string | null = null;
  const pageSize = Math.min(Math.max(opts?.limit ?? 100, 1), 200);

  for (let page = 0; page < 20; page++) {
    const body: Record<string, unknown> = {
      expansionId: [expansionId],
      productType: { op: "or", values: ["sealed"] },
      limit: pageSize,
    };
    if (opts?.gameId) body.gameFilters = { game: opts.gameId };
    if (cursor) body.cursor = cursor;

    const res = await cardnexusPost<SearchPage>(
      "/products/search",
      body,
      opts,
    );
    const rows = res?.data ?? [];
    for (const hit of rows) {
      if (hit.productType && hit.productType !== "sealed") continue;
      out.push(toSealed(hit));
    }
    cursor = res?.pagination?.nextCursor ?? null;
    if (!res?.pagination?.hasMore || !cursor || !rows.length) break;
  }
  return out;
}

/**
 * Resolve sealed products for a Placarr set code inside a CardNexus game.
 */
export async function listSealedForSetCode(
  gameId: CardnexusGameId,
  setCode: string,
  opts?: { signal?: AbortSignal },
): Promise<CardnexusSealedProduct[]> {
  const expansions = await loadExpansionIndex(gameId, opts);
  const expansionId = matchExpansionId(expansions, setCode);
  if (expansionId == null) return [];
  return listSealedForExpansionId(expansionId, { gameId, ...opts });
}
