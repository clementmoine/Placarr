/**
 * Per-card TCGdex detail enrich — rarity / stage.
 *
 * Set briefs (`/sets/{id}`) carry names + images + `releaseDate` on the set,
 * but **not** card rarity. Filling that needs `/cards/{id}` — budgeted so Sync
 * stays polite and incremental (autonomie : chaque passe living en comble un
 * peu plus, sans N×sets×cartes d’un coup).
 */
import { httpGet } from "@/lib/http/httpClient";

import {
  listTcgdexTitlesMissingRarity,
  patchTcgdexTitleDetails,
} from "./indexStore";

const API_BASE = "https://api.tcgdex.net/v2";

/** Auto Sync — fill a slice each hour rather than hammer the host. */
export const TCGDEX_DETAIL_ENRICH_AUTO_LIMIT = 120;
/** Manual Sync — larger budget; still capped. */
export const TCGDEX_DETAIL_ENRICH_FORCE_LIMIT = 2_000;

type RawCardDetail = {
  rarity?: unknown;
  stage?: unknown;
};

export type EnrichTcgdexCardDetailsOptions = {
  limit?: number;
  delayMs?: number;
  onProgress?: (message: string) => void;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

async function fetchCardDetail(
  lang: string,
  providerId: string,
): Promise<{ rarity: string | null; stage: string | null } | null> {
  const id = providerId.trim();
  const language = lang.trim().toLowerCase();
  if (!id || !language) return null;
  try {
    const response = await httpGet<RawCardDetail>(
      `${API_BASE}/${language}/cards/${encodeURIComponent(id)}`,
      { timeout: 20_000 },
    );
    const data = response.data;
    if (!data) return null;
    return {
      rarity: text(data.rarity),
      stage: text(data.stage),
    };
  } catch {
    return null;
  }
}

export async function enrichTcgdexCardDetails(
  opts: EnrichTcgdexCardDetailsOptions = {},
): Promise<{ attempted: number; patched: number; failed: number }> {
  const limit = opts.limit ?? TCGDEX_DETAIL_ENRICH_AUTO_LIMIT;
  const delayMs = opts.delayMs ?? 120;
  const report = opts.onProgress ?? (() => {});
  const gaps = listTcgdexTitlesMissingRarity(limit);
  if (gaps.length === 0) {
    report("Pokémon détails : rien à enrichir (rareté déjà posée)");
    return { attempted: 0, patched: 0, failed: 0 };
  }

  report(`Pokémon détails : ${gaps.length} titres sans rareté…`);
  const patches: {
    printKey: string;
    lang: string;
    rarity: string | null;
    stage: string | null;
  }[] = [];
  let failed = 0;

  for (let i = 0; i < gaps.length; i += 1) {
    const gap = gaps[i]!;
    if (delayMs > 0 && i > 0) await sleep(delayMs);
    const detail = await fetchCardDetail(gap.lang, gap.providerId);
    if (!detail || (!detail.rarity && !detail.stage)) {
      failed += 1;
      continue;
    }
    patches.push({
      printKey: gap.printKey,
      lang: gap.lang,
      rarity: detail.rarity,
      stage: detail.stage,
    });
    if (patches.length % 40 === 0) {
      report(`   ${patches.length} détails récupérés…`);
    }
  }

  const patched = patchTcgdexTitleDetails(patches);
  report(
    `Pokémon détails : ${patched} titres enrichis, ${failed} sans rareté à la source`,
  );
  return { attempted: gaps.length, patched, failed };
}
