/**
 * Limitless TCG Pocket faces → `art.limitless.webp` under cards/{lang}/{set}/{num}/.
 *
 * CDN: `…/pocket/{Set}/{Set}_{nnn}_EN.webp` (FR often 403 — EN art is the
 * available scan; write into the requested lang folder so FR catalogue resolves).
 *
 * Harvest targets every unprinted TCGdex row still missing local art (B1, A3b…),
 * not a single hard-coded set — Pocket ships often.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { softRetryNull } from "@/lib/http/softRetry";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import {
  listTcgdexUnprintedMissingArt,
  syncTcgdexPrintAssetsFromDisk,
} from "../../indexStore";

const LIMITLESS_POCKET_CDN =
  "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket";
const LIMITLESS_REFERER = "https://limitlesstcg.com/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type LimitlessPocketFillReport = {
  setId: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

export type LimitlessPocketGapsReport = {
  sets: LimitlessPocketFillReport[];
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  assetsSynced: number;
};

export function limitlessPocketFaceUrl(
  setId: string,
  localId: string,
  locale: "EN" | "FR" = "EN",
): string {
  const set = setId.trim();
  const digits = localId.replace(/\D/g, "") || localId;
  const n = String(Number.parseInt(digits, 10) || digits).padStart(3, "0");
  return `${LIMITLESS_POCKET_CDN}/${set}/${set}_${n}_${locale}.webp`;
}

/**
 * TCGdex Pocket CDN path carries Limitless casing (`…/tcgp/A3b/001`).
 * Falls back to the sqlite set id when the base is missing / non-tcgp.
 */
export function limitlessPocketSetCodeFromImageBase(
  imageBaseUrl: string | null | undefined,
  fallbackSetId?: string,
): string {
  const raw = imageBaseUrl?.trim() ?? "";
  const fromCdn = /assets\.tcgdex\.net\/[a-z]{2}\/tcgp\/([^/]+)/i.exec(raw);
  if (fromCdn?.[1]) return fromCdn[1];
  return (fallbackSetId ?? "").trim();
}

async function download(url: string): Promise<Buffer | null> {
  return softRetryNull(async () => {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: LIMITLESS_REFERER,
        Accept: "image/webp,image/png,image/*;q=0.8,*/*;q=0.5",
      },
      responseType: "arraybuffer",
      timeout: 40_000,
      noDedup: true,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  });
}

export async function fillLimitlessPocketFacesForSet(opts: {
  setId: string;
  localIds: readonly string[];
  /** Catalogue folder lang (default fr). CDN prefers EN when FR 403s. */
  lang?: string;
  force?: boolean;
  cardsRoot?: string;
}): Promise<LimitlessPocketFillReport> {
  const setId = opts.setId.trim();
  const lang = (opts.lang ?? "fr").trim().toLowerCase() || "fr";
  const report: LimitlessPocketFillReport = {
    setId,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  if (!setId) return report;

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("limitless", "art", "webp"),
    );
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }
    const buf =
      (await download(limitlessPocketFaceUrl(setId, localId, "EN"))) ??
      (await download(limitlessPocketFaceUrl(setId, localId, "FR")));
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

/**
 * Densify every unprinted (Pocket) title still missing local art for `lang`.
 * Groups by Limitless CDN set casing derived from `image_base_url`.
 */
export async function fillLimitlessPocketMissingFaces(opts: {
  lang?: string;
  force?: boolean;
  cardsRoot?: string;
  syncAssets?: boolean;
} = {}): Promise<LimitlessPocketGapsReport> {
  const lang = (opts.lang ?? "fr").trim().toLowerCase() || "fr";
  const rows = listTcgdexUnprintedMissingArt({ lang });
  const bySet = new Map<string, string[]>();
  for (const row of rows) {
    const setCode = limitlessPocketSetCodeFromImageBase(
      row.imageBaseUrl,
      row.setId,
    );
    if (!setCode) continue;
    const list = bySet.get(setCode) ?? [];
    list.push(row.localId);
    bySet.set(setCode, list);
  }

  const sets: LimitlessPocketFillReport[] = [];
  let tried = 0;
  let written = 0;
  let skipped = 0;
  let failed = 0;
  for (const [setId, localIds] of bySet) {
    const report = await fillLimitlessPocketFacesForSet({
      setId,
      localIds,
      lang,
      force: opts.force,
      cardsRoot: opts.cardsRoot,
    });
    sets.push(report);
    tried += report.tried;
    written += report.written;
    skipped += report.skipped;
    failed += report.failed;
  }

  const assetsSynced =
    opts.syncAssets === false
      ? 0
      : syncTcgdexPrintAssetsFromDisk({
          cardsRoot: opts.cardsRoot,
          languages: [lang],
        });

  return { sets, tried, written, skipped, failed, assetsSynced };
}
