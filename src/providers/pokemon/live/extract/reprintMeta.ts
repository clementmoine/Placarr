/**
 * `data/pokemon/reprintMeta.json` — décalages des splits « *sv » de TCGdex
 * (Shiny Vault : ex. `swsh4.5sv` → Live `swsh4-5` + 73) dont le stem Live
 * dédié manque au dump. Dérivé de l'API TCGdex publique + du dump Live ;
 * lu par `liveJoin.remapCollectorNumberForLive`.
 *
 * Reconstruit à chaque Sync Pokémon (étape `extract`) — jamais à la main.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";
import {
  liveSetIdFromTcgdexSet,
  mechanicalReprintFallbackStems,
} from "@/effects/pokemon/liveSetId";

export function reprintMetaPath(): string {
  return path.join(dataRoot(), "pokemon", "reprintMeta.json");
}

function cardsPath(): string {
  return path.join(dataRoot(), "pokemon", "cards.json");
}

/** Stems de set Live → nombre de bundles, depuis `cards.json`. */
export function loadLiveSets(
  cards: Record<string, unknown>,
): Map<string, number> {
  const sets = new Map<string, number>();
  for (const id of Object.keys(cards)) {
    const set = id.split("_")[0];
    if (!set) continue;
    sets.set(set, (sets.get(set) ?? 0) + 1);
  }
  return sets;
}

export async function fetchTcgdexSetIds(lang: "fr" | "en"): Promise<string[]> {
  const url = `https://api.tcgdex.net/v2/${lang}/sets`;
  const res = await httpGet<Array<{ id?: string }>>(url, {
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`TCGdex ${lang} sets HTTP ${res.status}`);
  }
  return res.data
    .map((row) => row.id?.trim().toLowerCase())
    .filter((id): id is string => Boolean(id));
}

export async function fetchTcgdexSetDetail(
  lang: "fr" | "en",
  id: string,
): Promise<{ id: string; cardTotal: number } | null> {
  const url = `https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(id)}`;
  const res = await httpGet<{
    id?: string;
    cardCount?: { total?: number; official?: number };
  }>(url, { validateStatus: () => true });
  if (res.status < 200 || res.status >= 300) return null;
  const body = res.data;
  const total = body.cardCount?.total ?? body.cardCount?.official ?? 0;
  if (!body.id || total <= 0) return null;
  return { id: body.id, cardTotal: total };
}

/**
 * Écrit les offsets des splits `*sv` dont le stem parent est dans le dump et
 * le stem dédié absent. Rend le nombre d'entrées.
 */
export async function writeReprintMetaFile(opts: {
  tcgdexIds: string[];
  liveBundles: Map<string, number>;
  fetchDetail?: typeof fetchTcgdexSetDetail;
  outPath?: string;
}): Promise<number> {
  const fetchDetail = opts.fetchDetail ?? fetchTcgdexSetDetail;
  const byTcgdexSet: Record<
    string,
    {
      parentTcgdex: string;
      parentLive: string;
      svOffset: number;
      parentCardTotal: number;
      vaultCardTotal: number;
    }
  > = {};

  for (const tid of opts.tcgdexIds) {
    const fallbacks = mechanicalReprintFallbackStems(tid);
    if (fallbacks.length === 0) continue;
    const parentLive = fallbacks[0]!;
    if (!opts.liveBundles.has(parentLive)) continue;
    const primary = liveSetIdFromTcgdexSet(tid);
    if (primary && opts.liveBundles.has(primary)) continue;

    const parentTcgdex = tid.slice(0, -2);
    const [parentDetail, vaultDetail] = await Promise.all([
      fetchDetail("fr", parentTcgdex),
      fetchDetail("fr", tid),
    ]);
    if (!parentDetail || !vaultDetail) continue;

    byTcgdexSet[tid] = {
      parentTcgdex,
      parentLive,
      svOffset: parentDetail.cardTotal,
      parentCardTotal: parentDetail.cardTotal,
      vaultCardTotal: vaultDetail.cardTotal,
    };
  }

  writeFileSync(
    opts.outPath ?? reprintMetaPath(),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "tcgdex-fr+live-dump",
        byTcgdexSet,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return Object.keys(byTcgdexSet).length;
}

/** Étape Sync : relit le dump Live et les sets TCGdex FR, réécrit le fichier. */
export async function refreshPokemonReprintMeta(): Promise<number | null> {
  if (!existsSync(cardsPath())) return null;
  const cards = JSON.parse(readFileSync(cardsPath(), "utf8")) as Record<
    string,
    unknown
  >;
  return writeReprintMetaFile({
    tcgdexIds: await fetchTcgdexSetIds("fr"),
    liveBundles: loadLiveSets(cards),
  });
}
