/**
 * Fetch one CCG Trader game (series + sets) from Directus.
 */
import { httpGet } from "@/lib/http/httpClient";

import {
  CCGTRADER_GAME_FIELDS,
  CCGTRADER_ITEMS_BASE,
  CCGTRADER_WWW_ORIGIN,
  ccgtraderGamePageUrl,
} from "./site";

export type CcgtraderSetRow = {
  id: number | string;
  name: string;
  urlTitle: string;
  releaseDate: string | null;
  status: string | null;
  seriesName: string | null;
};

export type CcgtraderGame = {
  id: number;
  name: string;
  urlTitle: string;
  publisher: string | null;
  publicationDate: string | null;
  inPrint: boolean | null;
  languages: string[];
  website: string | null;
  description: string | null;
  pageUrl: string;
  series: { id: number | string; name: string; sort: number | null }[];
  sets: CcgtraderSetRow[];
};

type DirectusSet = {
  id?: number | string;
  name?: string;
  url_title?: string;
  release_date?: string | null;
  status?: string | null;
  sort?: number | null;
};

type DirectusSeries = {
  id?: number | string;
  name?: string;
  sort?: number | null;
  sets?: DirectusSet[] | null;
};

type DirectusGame = {
  id?: number;
  name?: string;
  url_title?: string;
  publisher?: string | null;
  publication_date?: string | null;
  in_print?: boolean | null;
  languages?: string[] | null;
  website?: string | null;
  description?: string | null;
  series?: DirectusSeries[] | null;
};

type DirectusList<T> = { data?: T[] | null };

const UA =
  "Mozilla/5.0 (compatible; Placarr/0.1; +https://github.com/) CcgtraderGame";

export function ccgtraderGameApiUrl(urlTitle: string): string {
  const fields = CCGTRADER_GAME_FIELDS.join(",");
  const filter = encodeURIComponent(urlTitle);
  return `${CCGTRADER_ITEMS_BASE}/game?filter%5Burl_title%5D%5Beq%5D=${filter}&fields=${fields}&limit=1`;
}

export function parseCcgtraderGame(
  raw: DirectusGame,
  urlTitle: string,
): CcgtraderGame {
  const seriesRaw = Array.isArray(raw.series) ? raw.series : [];
  const series = seriesRaw
    .filter((row) => row && (row.name || row.id != null))
    .map((row) => ({
      id: row.id ?? row.name ?? "",
      name: String(row.name ?? "").trim() || String(row.id ?? ""),
      sort: typeof row.sort === "number" ? row.sort : null,
    }));

  const sets: CcgtraderSetRow[] = [];
  for (const seriesRow of seriesRaw) {
    const seriesName = String(seriesRow?.name ?? "").trim() || null;
    for (const set of seriesRow?.sets ?? []) {
      const slug = String(set?.url_title ?? "").trim();
      const name = String(set?.name ?? "").trim();
      if (!slug && !name) continue;
      sets.push({
        id: set?.id ?? (slug || name),
        name: name || slug,
        urlTitle: slug || name,
        releaseDate: set?.release_date ? String(set.release_date) : null,
        status: set?.status ? String(set.status) : null,
        seriesName,
      });
    }
  }

  return {
    id: Number(raw.id),
    name: String(raw.name ?? urlTitle),
    urlTitle: String(raw.url_title ?? urlTitle),
    publisher: raw.publisher ?? null,
    publicationDate: raw.publication_date ?? null,
    inPrint: raw.in_print ?? null,
    languages: Array.isArray(raw.languages)
      ? raw.languages.map(String)
      : [],
    website: raw.website ?? null,
    description: raw.description ?? null,
    pageUrl: ccgtraderGamePageUrl(String(raw.url_title ?? urlTitle)),
    series,
    sets,
  };
}

export async function fetchCcgtraderGame(opts: {
  urlTitle: string;
  signal?: AbortSignal;
}): Promise<CcgtraderGame> {
  const url = ccgtraderGameApiUrl(opts.urlTitle);
  const res = await httpGet<DirectusList<DirectusGame>>(url, {
    signal: opts.signal,
    timeout: 45_000,
    responseType: "json",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Origin: CCGTRADER_WWW_ORIGIN,
      Referer: `${CCGTRADER_WWW_ORIGIN}/`,
    },
    validateStatus: (status) => status === 200,
  });
  const row = res.data?.data?.[0];
  if (!row) {
    throw new Error(`ccgtrader game: empty for url_title=${opts.urlTitle}`);
  }
  const game = parseCcgtraderGame(row, opts.urlTitle);
  if (!game.sets.length) {
    throw new Error(
      `ccgtrader game: no sets for url_title=${opts.urlTitle} (${game.name})`,
    );
  }
  return game;
}
