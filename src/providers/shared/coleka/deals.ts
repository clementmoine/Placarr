/**
 * Coleka « bons plans » / deals API — free path to per-item EUR quotes.
 *
 * Official « Cote COLEKA » on item pages is premium-gated
 * (`POST /_scripts/js/quotation/ajax.php` → `price: null` when unlogged).
 * Listings never embed per-tile prices.
 *
 * The deals endpoint does **not** trip Cloudflare Turnstile and returns
 * structured JSON including `op.current_quotation_in_euro` (Coleka cote)
 * plus live marketplace `op.price_in_euro` — but only for items that
 * currently have an affiliate opportunity (partial coverage per rubrique).
 */
import { httpPost } from "@/lib/http/httpClient";

export const COLEKA_ORIGIN = "https://www.coleka.com";
export const COLEKA_DEALS_URL = `${COLEKA_ORIGIN}/_scripts/js/deals/ajax.php`;

export type ColekaDealOffer = {
  colekaId: string;
  rubriqueId: string;
  refItem: string | null;
  title: string | null;
  /** Coleka estimated cote (EUR), when present. */
  quotationEuro: number | null;
  /** Live marketplace ask (EUR). */
  offerEuro: number | null;
  shippingEuro: number | null;
  marketplace: string | null;
  externalId: string | null;
  observedAt: string | null;
  affiliatePath: string | null;
};

export type ColekaDealsFetchResult = {
  rubriqueId: string;
  offerCount: number;
  items: ColekaDealOffer[];
};

type ColekaDealRawPayload = {
  html?: unknown;
  raw?: {
    url?: unknown;
    titre_item?: unknown;
    prix?: unknown;
    price_in_euro?: unknown;
    shipping?: unknown;
    offername?: unknown;
  };
  op?: {
    id_rubrique?: unknown;
    id_item?: unknown;
    ref_item?: unknown;
    current_quotation_in_euro?: unknown;
    price_in_euro?: unknown;
    shipping?: unknown;
    dt_op?: unknown;
    id_externe?: unknown;
    type_externe?: unknown;
  };
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function asIdString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return asTrimmedString(value);
}

/** Parse Coleka EUR fields (`"7.00"`, `"9.93"`, `"10€"`). */
export function parseColekaEuro(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = asTrimmedString(value);
  if (!s) return null;
  const m = s.replace(/\s/g, "").match(/^(\d+(?:[.,]\d+)?)/);
  if (!m?.[1]) return null;
  const n = Number.parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Coleka listing refs (`A 001`, `Z 002`, `P 007`) → compact printed (`A001`).
 * Pads 1–2 digit numbers to 3 digits (Bleach / Carddass style).
 */
export function normalizeColekaRefItem(ref: string | null | undefined): string | null {
  const raw = asTrimmedString(ref);
  if (!raw) return null;
  const m = raw.match(/^([A-Za-z]+)\s*(\d{1,4})$/);
  if (!m) return null;
  const prefix = m[1]!.toUpperCase();
  const num = m[2]!;
  const padded = num.length <= 3 ? num.padStart(3, "0") : num;
  return `${prefix}${padded}`;
}

export function parseColekaDealEntry(
  entry: unknown,
): ColekaDealOffer | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as ColekaDealRawPayload;
  const op = row.op;
  const raw = row.raw;
  const colekaId = asIdString(op?.id_item);
  if (!colekaId) return null;
  const rubriqueId = asIdString(op?.id_rubrique) ?? "";
  return {
    colekaId,
    rubriqueId,
    refItem: asTrimmedString(op?.ref_item),
    title: asTrimmedString(raw?.titre_item),
    quotationEuro: parseColekaEuro(op?.current_quotation_in_euro),
    offerEuro: parseColekaEuro(op?.price_in_euro ?? raw?.price_in_euro),
    shippingEuro: parseColekaEuro(op?.shipping ?? raw?.shipping),
    marketplace: asTrimmedString(raw?.offername ?? op?.type_externe),
    externalId: asIdString(op?.id_externe),
    observedAt: asTrimmedString(op?.dt_op),
    affiliatePath: asTrimmedString(raw?.url),
  };
}

/** Collapse multiple marketplace rows to one item (prefer latest `observedAt`). */
export function uniqueColekaDealsByItem(
  offers: ColekaDealOffer[],
): ColekaDealOffer[] {
  const byId = new Map<string, ColekaDealOffer>();
  for (const offer of offers) {
    const prev = byId.get(offer.colekaId);
    if (!prev) {
      byId.set(offer.colekaId, offer);
      continue;
    }
    const prevTs = prev.observedAt ?? "";
    const nextTs = offer.observedAt ?? "";
    if (nextTs >= prevTs) byId.set(offer.colekaId, offer);
  }
  return [...byId.values()].sort((a, b) =>
    (a.refItem ?? a.colekaId).localeCompare(b.refItem ?? b.colekaId),
  );
}

export function parseColekaDealsPayload(body: unknown): ColekaDealOffer[] {
  if (!Array.isArray(body)) return [];
  const out: ColekaDealOffer[] = [];
  for (const entry of body) {
    const parsed = parseColekaDealEntry(entry);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function fetchColekaRubriqueDeals(
  rubriqueId: string | number,
  opts: {
    signal?: AbortSignal;
    lang?: string;
    /** Cap requested by Coleka UI (server may return fewer). */
    nbs?: number;
    location?: string;
    /** Session cookie (`PHPSESSID=…; colekaID2=…`) — deals are empty without it. */
    cookie?: string;
  } = {},
): Promise<ColekaDealsFetchResult> {
  const id = String(rubriqueId).trim();
  if (!/^\d+$/.test(id)) {
    return { rubriqueId: id, offerCount: 0, items: [] };
  }
  const lang = opts.lang ?? "fr";
  const nbs = opts.nbs ?? 100;
  const location = opts.location ?? "page_item_foot";
  const params = new URLSearchParams({
    action: "loaditems",
    id_rubrique: id,
    location,
    lang,
    nbs: String(nbs),
  });
  const cookie =
    opts.cookie?.trim() || process.env.COLEKA_COOKIE?.trim() || "";
  const res = await httpPost<unknown>(COLEKA_DEALS_URL, params.toString(), {
    signal: opts.signal,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: COLEKA_ORIGIN,
      Referer: `${COLEKA_ORIGIN}/fr/`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    hostProfile: "scrape",
    validateStatus: (s) => s >= 200 && s < 500,
  });
  if (res.status !== 200) {
    return { rubriqueId: id, offerCount: 0, items: [] };
  }
  const offers = parseColekaDealsPayload(res.data);
  const items = uniqueColekaDealsByItem(offers);
  return { rubriqueId: id, offerCount: offers.length, items };
}
