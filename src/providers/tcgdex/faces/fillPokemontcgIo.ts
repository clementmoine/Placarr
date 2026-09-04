/**
 * Fill EN McDo faces from images.pokemontcg.io (years with CDN coverage).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../faceChoice";
import { pokemonPaperCardDir } from "../paperCardDisk";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** TCGdex McDo set → pokemontcg.io stem. 2023/2024 absent on CDN. */
export const POKEMONTCG_MCDO_STEMS: Readonly<Record<string, string>> = {
  "2011bw": "mcd11",
  "2012bw": "mcd12",
  "2014xy": "mcd14",
  "2015xy": "mcd15",
  "2016xy": "mcd16",
  "2017sm": "mcd17",
  "2018sm": "mcd18",
  "2019sm": "mcd19",
  "2021swsh": "mcd21",
  "2022swsh": "mcd22",
};

export function pokemontcgIoMcdoImageUrl(
  stem: string,
  localId: string,
): string {
  const n = localId.replace(/\D/g, "") || localId;
  return `https://images.pokemontcg.io/${stem}/${n}_hires.png`;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export type PokemontcgFillReport = {
  setId: string;
  stem: string | null;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

export async function fillPokemontcgIoFacesForSet(opts: {
  setId: string;
  localIds: readonly string[];
  cardCount?: number;
  lang?: string;
  force?: boolean;
  cardsRoot?: string;
}): Promise<PokemontcgFillReport> {
  const stem = POKEMONTCG_MCDO_STEMS[opts.setId] ?? null;
  const lang = (opts.lang ?? "en").toLowerCase();
  const report: PokemontcgFillReport = {
    setId: opts.setId,
    stem,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  if (!stem) return report;

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("pokemontcg", "art", "png"),
    );
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }
    const buf = await download(pokemontcgIoMcdoImageUrl(stem, localId));
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }
  return report;
}
