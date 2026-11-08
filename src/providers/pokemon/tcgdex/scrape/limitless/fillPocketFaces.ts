/**
 * Limitless TCG Pocket faces → `art.limitless.webp` under cards/{lang}/{set}/{num}/.
 *
 * CDN: `…/pocket/{Set}/{Set}_{nnn}_EN.webp` (FR often 403 — EN art is the
 * available scan; write into the requested lang folder so FR catalogue resolves).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";

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

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: LIMITLESS_REFERER,
        Accept: "image/webp,image/png,image/*;q=0.8,*/*;q=0.5",
      },
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
