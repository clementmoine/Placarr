/**
 * EN (and other) faces from TCGPlayer CDN using TCGdex thirdParty ids.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../faceChoice";
import { API_BASE } from "../api";
import { pokemonPaperCardDir } from "../paperCardDisk";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export function tcgplayerProductImageUrl(productId: number): string {
  return `https://product-images.tcgplayer.com/fit-in/1000x1000/${productId}.jpg`;
}

export function tcgplayerIdFromCardPayload(raw: {
  variants_detailed?: Array<{
    thirdParty?: { tcgplayer?: number | null };
  }> | null;
}): number | null {
  for (const row of raw.variants_detailed ?? []) {
    const id = row.thirdParty?.tcgplayer;
    if (typeof id === "number" && id > 0) return id;
  }
  return null;
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

export type TcgplayerFillReport = {
  setId: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

/**
 * For each localId in `localIds`, fetch TCGdex EN card → TCGPlayer image →
 * `art.tcgplayer.jpg` under cards/{set}/en/{num}/.
 */
export async function fillTcgplayerFacesForSet(opts: {
  setId: string;
  localIds: readonly string[];
  lang?: string;
  force?: boolean;
  cardsRoot?: string;
  fetchCard?: (tcgdexId: string) => Promise<unknown>;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<TcgplayerFillReport> {
  const lang = (opts.lang ?? "en").toLowerCase();
  const report: TcgplayerFillReport = {
    setId: opts.setId,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };

  const fetchCard =
    opts.fetchCard ??
    (async (tcgdexId: string) => {
      const res = await httpGet<Record<string, unknown>>(
        `${API_BASE}/en/cards/${encodeURIComponent(tcgdexId)}`,
        {
          headers: { "User-Agent": UA, Accept: "application/json" },
          timeout: 30_000,
          validateStatus: (s) => s === 200,
        },
      );
      return res.data;
    });
  const downloadImage = opts.downloadImage ?? download;

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
      pokemonFaceFilename("tcgplayer", "art", "jpg"),
    );
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    const tcgdexId = `${opts.setId}-${localId}`;
    let productId: number | null = null;
    try {
      const raw = (await fetchCard(tcgdexId)) as {
        variants_detailed?: Array<{
          thirdParty?: { tcgplayer?: number | null };
        }> | null;
      };
      productId = tcgplayerIdFromCardPayload(raw);
    } catch {
      report.failed += 1;
      continue;
    }
    if (!productId) {
      report.failed += 1;
      continue;
    }

    const buf = await downloadImage(tcgplayerProductImageUrl(productId));
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

/** McDo 2023 — 15 cards EN via TCGPlayer. */
export async function fillTcgplayerMcdo2023(
  opts: { force?: boolean; cardsRoot?: string } = {},
): Promise<TcgplayerFillReport> {
  return fillTcgplayerFacesForSet({
    setId: "2023sv",
    localIds: Array.from({ length: 15 }, (_, i) => String(i + 1)),
    lang: "en",
    force: opts.force,
    cardsRoot: opts.cardsRoot,
  });
}
