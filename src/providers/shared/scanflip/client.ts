/**
 * ScanFlip (scanflip.fr) — generic client for the site's card explorers.
 *
 * Data comes from Vike SSR (`application/json` pageContext) for page 1, then
 * telefunc `onSettingsUpdate` for further pages. Faces live on media.scanflip.fr
 * (watermarked CDN); we never invent titles.
 *
 * Chaque provider fournit son {@link ScanflipExplorerSpec} (chemin, fichier
 * telefunc, filtres) — ce module ne connaît aucun jeu nommément.
 */
import { httpGet, httpPost } from "@/lib/http/httpClient";

export const SCANFLIP_ORIGIN = "https://www.scanflip.fr";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/** Explorer d'un jeu sur ScanFlip — défini par le provider appelant. */
export type ScanflipExplorerSpec = {
  /** Chemin listing, ex. `/fr/<jeu>/cards`. */
  path: string;
  /** Fichier telefunc `onSettingsUpdate` de l'explorateur. */
  telefuncFile: string;
  /** Filtres par défaut envoyés au telefunc. */
  defaultFilters: Record<string, unknown>;
};

export type ScanflipCardRow = {
  id: string;
  slug: string;
  code: string;
  name: string;
  imageCdn: string | null;
  imageLowResCdn: string | null;
  expansionName: string | null;
  rarityCode: string | null;
  rarityName: string | null;
  version: string | null;
  formerName: string | null;
  generalType: string | null;
  releaseDate: string | null;
};

export type ScanflipPageResult = {
  page: number;
  pageSize: number;
  totalCount: number;
  data: ScanflipCardRow[];
};

function parseReleaseDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function normalizeCard(raw: Record<string, unknown>): ScanflipCardRow | null {
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!slug || !code || !name) return null;
  const rarity =
    raw.rarity && typeof raw.rarity === "object"
      ? (raw.rarity as Record<string, unknown>)
      : null;
  return {
    id: typeof raw.id === "string" ? raw.id : slug,
    slug,
    code,
    name,
    imageCdn: typeof raw.imageCdn === "string" ? raw.imageCdn : null,
    imageLowResCdn:
      typeof raw.imageLowResCdn === "string" ? raw.imageLowResCdn : null,
    expansionName:
      typeof raw.expansionName === "string" ? raw.expansionName : null,
    rarityCode: typeof rarity?.code === "string" ? rarity.code : null,
    rarityName: typeof rarity?.name === "string" ? rarity.name : null,
    version: typeof raw.version === "string" ? raw.version : null,
    formerName: typeof raw.formerName === "string" ? raw.formerName : null,
    generalType: typeof raw.generalType === "string" ? raw.generalType : null,
    releaseDate: parseReleaseDate(raw.releaseDate),
  };
}

function extractPageResult(payload: unknown): ScanflipPageResult | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const asPage = (obj: unknown): ScanflipPageResult | null => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const pageObj = obj as Record<string, unknown>;
    if (!Array.isArray(pageObj.data)) return null;
    const cards: ScanflipCardRow[] = [];
    for (const row of pageObj.data) {
      if (!row || typeof row !== "object") continue;
      const card = normalizeCard(row as Record<string, unknown>);
      if (card) cards.push(card);
    }
    return {
      page: Number(pageObj.page) || 1,
      pageSize: Number(pageObj.pageSize) || cards.length || 500,
      totalCount: Number(pageObj.totalCount) || cards.length,
      data: cards,
    };
  };

  const ret =
    root.ret && typeof root.ret === "object"
      ? (root.ret as Record<string, unknown>)
      : null;
  return asPage(root) ?? asPage(root.data) ?? asPage(ret?.data) ?? asPage(ret);
}

/** @internal vitest */
export const normalizeScanflipCardForTests = normalizeCard;
/** @internal vitest */
export const extractScanflipPageResultForTests = extractPageResult;

/** Prefer full CDN scan; fall back to low-res when needed. */
export function scanflipFaceUrl(card: ScanflipCardRow): string | null {
  return card.imageCdn?.trim() || card.imageLowResCdn?.trim() || null;
}

/**
 * ScanFlip moved off `application/json` pageContext to RSC + SSR HTML tiles.
 * Parse watermarked `media.scanflip.fr` + printed code + card slug from markup.
 */
export function parseScanflipExplorerHtml(
  html: string,
  page = 1,
): ScanflipPageResult {
  const cards: ScanflipCardRow[] = [];
  const seen = new Set<string>();
  const tileRe =
    /<img[^>]+src="(https:\/\/media\.scanflip\.fr\/[^"]+)"[\s\S]{0,500}?font-bold">([A-Z0-9-]+)<\/span>[\s\S]{0,240}?href="(\/fr\/[^"]+\/card\/([^"]+))"/gi;
  let match: RegExpExecArray | null;
  while ((match = tileRe.exec(html))) {
    const image = match[1]!;
    const code = match[2]!;
    const slug = match[4]!;
    if (!code || !slug || seen.has(code)) continue;
    seen.add(code);
    const nameGuess = slug
      .replace(/^[a-z0-9-]+?-(?:[cur]|scr|ur|sr|r|c|u)-?/i, "")
      .replace(/-/g, " ")
      .trim();
    cards.push({
      id: slug,
      slug,
      code,
      name: nameGuess || code,
      imageCdn: image,
      imageLowResCdn: image,
      expansionName: null,
      rarityCode: null,
      rarityName: null,
      version: null,
      formerName: null,
      generalType: null,
      releaseDate: null,
    });
  }
  const totalMatch = html.match(/totalCount[:\s]+(\d{2,})/);
  const totalCount = totalMatch ? Number(totalMatch[1]) : cards.length;
  return {
    page,
    pageSize: cards.length || 500,
    totalCount,
    data: cards,
  };
}

export async function fetchScanflipCardsPageSsr(
  spec: ScanflipExplorerSpec,
  page = 1,
): Promise<ScanflipPageResult> {
  const base = `${SCANFLIP_ORIGIN}${spec.path}`;
  const url = page > 1 ? `${base}${base.includes("?") ? "&" : "?"}page=${page}` : base;
  const res = await httpGet<string>(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*;q=0.8",
      "Accept-Language": "fr,en;q=0.8",
    },
    responseType: "text",
    timeout: 60_000,
    validateStatus: (s) => s === 200,
  });
  const html = typeof res.data === "string" ? res.data : String(res.data ?? "");
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const match of scripts) {
    try {
      const pageContext = JSON.parse(match[1]!) as {
        data?: {
          cardsDb?: { initialQueryResult?: unknown };
          mainTracker?: { initialQueryResult?: unknown };
        };
      };
      const fromDb = extractPageResult(
        pageContext.data?.cardsDb?.initialQueryResult,
      );
      if (fromDb?.data.length) return fromDb;
      const fromTracker = extractPageResult(
        pageContext.data?.mainTracker?.initialQueryResult,
      );
      if (fromTracker?.data.length) return fromTracker;
    } catch {
      /* next script */
    }
  }
  return parseScanflipExplorerHtml(html, page);
}

export async function fetchScanflipCardsPageTelefunc(
  spec: ScanflipExplorerSpec,
  page: number,
  opts: { languages?: string[] } = {},
): Promise<ScanflipPageResult> {
  const filters = {
    ...spec.defaultFilters,
    ...(opts.languages ? { languages: opts.languages } : {}),
  };
  const body = {
    file: spec.telefuncFile,
    name: "onSettingsUpdate",
    args: [
      "explorer",
      {
        filters,
        orderBy: "releaseDate",
        orderDirection: "asc",
        page,
        viewMode: "grid",
      },
      1,
    ],
  };
  const res = await httpPost<unknown>(
    `${SCANFLIP_ORIGIN}/_telefunc?_telefunc=txt`,
    body,
    {
      headers: {
        "User-Agent": UA,
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: SCANFLIP_ORIGIN,
        Referer: `${SCANFLIP_ORIGIN}${spec.path}`,
        Accept: "*/*",
      },
      timeout: 60_000,
      validateStatus: (s) => s === 200,
    },
  );
  const parsed = extractPageResult(res.data);
  if (!parsed) {
    throw new Error(`ScanFlip telefunc ${spec.path} page ${page}: empty payload`);
  }
  return parsed;
}

export type HarvestScanflipOptions = {
  languages?: string[];
  /** Cap pages (testing). */
  maxPages?: number;
  delayMs?: number;
  onPage?: (page: ScanflipPageResult) => void;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Full catalogue harvest: SSR page 1, then telefunc until exhausted.
 * Dedupes by `id` (ScanFlip creative id).
 */
export async function harvestScanflipCards(
  spec: ScanflipExplorerSpec,
  opts: HarvestScanflipOptions = {},
): Promise<{ cards: ScanflipCardRow[]; totalCount: number; pages: number }> {
  const delayMs = opts.delayMs ?? 120;
  const first = await fetchScanflipCardsPageSsr(spec, 1);
  opts.onPage?.(first);
  const byId = new Map<string, ScanflipCardRow>();
  for (const card of first.data) byId.set(card.id, card);

  let page = 1;
  let totalCount = first.totalCount;
  const pageSize = first.pageSize || 500;
  const maxPages =
    opts.maxPages ??
    Math.max(1, Math.ceil((totalCount || first.data.length) / pageSize));

  while (page < maxPages && byId.size < (totalCount || Infinity)) {
    page += 1;
    if (delayMs > 0) await sleep(delayMs);
    let next: ScanflipPageResult;
    try {
      next = await fetchScanflipCardsPageTelefunc(spec, page, {
        languages: opts.languages,
      });
      if (!next.data.length) {
        next = await fetchScanflipCardsPageSsr(spec, page);
      }
    } catch {
      // Telefunc broke (RSC-only explorers) — fall back to SSR `?page=`.
      next = await fetchScanflipCardsPageSsr(spec, page);
    }
    opts.onPage?.(next);
    totalCount = next.totalCount || totalCount;
    if (!next.data.length) break;
    for (const card of next.data) byId.set(card.id, card);
    if (next.data.length < pageSize) break;
  }

  const cards = [...byId.values()].sort((a, b) =>
    a.code.localeCompare(b.code, "en"),
  );
  return { cards, totalCount, pages: page };
}
