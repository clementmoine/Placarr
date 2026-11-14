/**
 * Nikita DBC pack sleeve — JA/EN verso for Dragon Ball Card Game.
 *
 * FR keeps the Shenron JCC sleeve (`curated/cards/back.jpg` → `back.webp`).
 * EN and JA share https://tcg-db.nikita.jp/img/card/dbc/back.jpg as
 * `back.en.webp` / `back.ja.webp` under data (URL-recoverable — not curated).
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packCardsDir } from "@/lib/packPaths";
import { writeLosslessWebpFile } from "@/lib/media/losslessWebp";
import { nikitaCardBackUrl } from "@/providers/shared/nikita/cardlist";

import { DBS_JCC_PACK_ID } from "../pack";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const NIKITA_DBC_BACK_URL = nikitaCardBackUrl("dbc");

export function dbsJccNikitaBackDataPaths(): {
  ja: string;
  en: string;
} {
  const cards = packCardsDir(DBS_JCC_PACK_ID);
  return {
    ja: path.join(cards, "back.ja.webp"),
    en: path.join(cards, "back.en.webp"),
  };
}

/** @deprecated Prefer dbsJccNikitaBackDataPaths — CDN bytes no longer mirror into curated. */
export function dbsJccNikitaBackCuratedPaths(): {
  ja: string;
  en: string;
} {
  return dbsJccNikitaBackDataPaths();
}

/**
 * Download the nikita DBC sleeve straight into `data/dragonball/jcc/cards/`
 * as lossless WebP (no curated mirror — URL is stable).
 */
export async function harvestAndInstallDbsJccNikitaBacks(opts?: {
  force?: boolean;
}): Promise<{ downloaded: boolean; installed: number }> {
  const paths = dbsJccNikitaBackDataPaths();
  mkdirSync(path.dirname(paths.ja), { recursive: true });

  let downloaded = false;
  const needFetch =
    opts?.force || !existsSync(paths.ja) || !existsSync(paths.en);
  if (needFetch) {
    const res = await httpGet<ArrayBuffer>(NIKITA_DBC_BACK_URL, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      timeout: 40_000,
      responseType: "arraybuffer",
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data);
    if (buf.byteLength < 2_000) {
      throw new Error(
        `nikita DBC back too small (${buf.byteLength} B) from ${NIKITA_DBC_BACK_URL}`,
      );
    }
    await writeLosslessWebpFile(buf, paths.ja);
    copyFileSync(paths.ja, paths.en);
    downloaded = true;
  } else if (!existsSync(paths.en) && existsSync(paths.ja)) {
    copyFileSync(paths.ja, paths.en);
  }

  return {
    downloaded,
    installed: [paths.ja, paths.en].filter((p) => existsSync(p)).length,
  };
}
