/**
 * In-job PriceCharting HTTP singleflight + memo.
 * Same URL/query asked twice in one resolve ⇒ one network GET.
 * Cross-process reuse (Next↔worker) uses ProviderEvidence — see durableEvidence.ts.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type PriceChartingHttpResponse = {
  status: number;
  data: string;
  request: { res: { responseUrl: string } };
};

type StoreSlot = {
  promise?: Promise<PriceChartingHttpResponse>;
  response?: PriceChartingHttpResponse;
};

function normalizeFetchKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Stable search keys regardless of param order.
    if (parsed.pathname.includes("search-products")) {
      const q = parsed.searchParams.get("q") ?? "";
      const type = parsed.searchParams.get("type") ?? "";
      return `search:${decodeURIComponent(q).toLowerCase().trim()}|type=${type}`;
    }
    parsed.search = "";
    return `url:${parsed.toString().replace(/\/$/, "").toLowerCase()}`;
  } catch {
    return `raw:${url.trim().toLowerCase()}`;
  }
}

export class PriceChartingFetchStore {
  private readonly slots = new Map<string, StoreSlot>();

  async getOrFetch(
    url: string,
    fetcher: (url: string) => Promise<PriceChartingHttpResponse>,
  ): Promise<PriceChartingHttpResponse> {
    const key = normalizeFetchKey(url);
    const existing = this.slots.get(key);
    if (existing?.response) return existing.response;
    if (existing?.promise) return existing.promise;

    const slot: StoreSlot = {};
    this.slots.set(key, slot);
    const promise = fetcher(url)
      .then((response) => {
        slot.response = response;
        const finalUrl = response.request.res.responseUrl;
        if (finalUrl && normalizeFetchKey(finalUrl) !== key) {
          this.slots.set(normalizeFetchKey(finalUrl), { response });
        }
        return response;
      })
      .catch((error) => {
        this.slots.delete(key);
        throw error;
      });
    slot.promise = promise;
    return promise;
  }

  /** Seed an already-fetched body under both request and final URLs. */
  seed(requestUrl: string, response: PriceChartingHttpResponse): void {
    const payload = { response };
    this.slots.set(normalizeFetchKey(requestUrl), payload);
    const finalUrl = response.request.res.responseUrl;
    if (finalUrl) {
      this.slots.set(normalizeFetchKey(finalUrl), payload);
    }
  }
}

const priceChartingFetchStoreAls =
  new AsyncLocalStorage<PriceChartingFetchStore>();

export function runWithPriceChartingFetchStore<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return priceChartingFetchStoreAls.run(new PriceChartingFetchStore(), fn);
}

export function getPriceChartingFetchStore(): PriceChartingFetchStore | null {
  return priceChartingFetchStoreAls.getStore() ?? null;
}

/** Test helper: normalize key for assertions. */
export function priceChartingFetchStoreKeyForTests(url: string): string {
  return normalizeFetchKey(url);
}
