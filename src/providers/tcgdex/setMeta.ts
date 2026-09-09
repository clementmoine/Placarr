/**
 * TCGdex set → serie (block) name, cached per locale.
 *
 * Card payloads only carry the expansion (`set.name`, e.g. Duo de Choc). The
 * serie (`Soleil et Lune`) lives on `/sets/{id}` and is what collectors call
 * « la série » — so search / print labels fetch it once per set id.
 */
import { httpGet } from "@/lib/http/httpClient";

import { API_BASE } from "./api";
import type { TcgdexLanguage } from "./fetch";

export type TcgdexSetSerie = {
  serieId: string | null;
  serieName: string | null;
};

type RawSetDetail = {
  id?: unknown;
  name?: unknown;
  serie?: { id?: unknown; name?: unknown } | null;
};

const cache = new Map<string, Promise<TcgdexSetSerie>>();

function cacheKey(setId: string, language: TcgdexLanguage): string {
  return `${language}:${setId.trim().toLowerCase()}`;
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

async function loadSetSerie(
  setId: string,
  language: TcgdexLanguage,
  signal?: AbortSignal,
): Promise<TcgdexSetSerie> {
  const id = setId.trim();
  if (!id) return { serieId: null, serieName: null };
  try {
    const response = await httpGet<RawSetDetail>(
      `${API_BASE}/${language}/sets/${encodeURIComponent(id)}`,
      { signal, timeout: 15_000 },
    );
    const serie = response.data?.serie;
    return {
      serieId: text(serie?.id),
      serieName: text(serie?.name),
    };
  } catch {
    return { serieId: null, serieName: null };
  }
}

/** Cached serie for a TCGdex set id. Miss / error → null names (honest empty). */
export function tcgdexSetSerie(
  setId: string,
  language: TcgdexLanguage,
  signal?: AbortSignal,
): Promise<TcgdexSetSerie> {
  const key = cacheKey(setId, language);
  let pending = cache.get(key);
  if (!pending) {
    pending = loadSetSerie(setId, language, signal);
    cache.set(key, pending);
    // Do not cache permanent empties from aborted / flaky calls forever —
    // only drop on empty after settle so a later retry can recover.
    void pending.then((meta) => {
      if (!meta.serieName && !meta.serieId) cache.delete(key);
    });
  }
  return pending;
}

export function __resetTcgdexSetSerieCacheForTests(): void {
  cache.clear();
}

export function __seedTcgdexSetSerieCacheForTests(
  setId: string,
  language: TcgdexLanguage,
  meta: TcgdexSetSerie,
): void {
  cache.set(cacheKey(setId, language), Promise.resolve(meta));
}
