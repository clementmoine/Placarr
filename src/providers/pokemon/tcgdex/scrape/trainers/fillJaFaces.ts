/**
 * Official JP Trainers Website (pokemon-card.com) faces → `art.trainers.jpg`.
 *
 * Equivalent of the western catalogue CDN for Japanese paper: product pages
 * (`resultAPI.php?pg=`) + detail collector numbers (`001 / 051`). Limitless /
 * TCGdex omit many BW–XY JP scans that the Trainers CDN still hosts.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { softRetryNull } from "@/lib/http/softRetry";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
  resolvePokemonArtFilename,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import {
  listTcgdexJaPrintsMissingImageBase,
  syncTcgdexPrintAssetsFromDisk,
} from "../../indexStore";

const TRAINERS_ORIGIN = "https://www.pokemon-card.com";
const RESULT_API = `${TRAINERS_ORIGIN}/card-search/resultAPI.php`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * TCGdex JA set id → Trainers product `pg` ids (one print may appear in
 * sibling expansions that share a local set folder, e.g. BW8a).
 */
export const TRAINERS_JA_SET_PRODUCTS: Readonly<
  Record<string, readonly number[]>
> = {
  /** ライデンナックル + ラセンフォース (TCGdex folds both under bw8a). */
  bw8a: [374, 373],
  /** 強化拡張パック「サン＆ムーン」 */
  sm1p: [510],
  /** 拡張パック「キミを待つ島々」 */
  sm2k: [511],
  /** 強化拡張パック「新たなる試練の向こう」 */
  sm2p: [514],
  /** 強化拡張パック「ひかる伝説」 */
  sm3p: [519],
  /** ハイクラスパック「GXバトルブースト」 */
  sm4p: [522],
  /** 強化拡張パック「ウルトラフォース」 */
  sm5p: [527],
  /** 強化拡張パック「ジージーエンド」 */
  sm10a: [645],
  /** ハイクラスパック「VSTARユニバース」 */
  s12a: [869],
  /** 拡張パック「30th CELEBRATION」 */
  m6a: [961],
};

export type TrainersJaFillReport = {
  prints: number;
  products: number;
  written: number;
  skipped: number;
  failed: number;
  unmapped: number;
  assetsSynced: number;
};

type TrainersCardListItem = {
  cardID?: string;
  cardThumbFile?: string;
};

type TrainersResultPayload = {
  result?: number;
  maxPage?: number;
  hitCnt?: number;
  cardList?: TrainersCardListItem[];
};

export type TrainersCardFace = {
  cardId: string;
  imageUrl: string;
  collectorNumber: string;
  setTotal: string | null;
};

export function trainersAbsoluteAssetUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${TRAINERS_ORIGIN}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/** `001 / 051` (nbsp or plain) → local id + set size. */
export function parseTrainersCollectorLine(html: string): {
  number: string;
  total: string | null;
} | null {
  const m =
    /(?:&nbsp;|\s)*(\d{1,3})(?:&nbsp;|\s)*\/(?:&nbsp;|\s)*(\d{1,3})(?:&nbsp;|\s)*/.exec(
      html,
    );
  if (!m) return null;
  return {
    number: m[1]!.padStart(3, "0"),
    total: m[2] ?? null,
  };
}

export async function fetchTrainersProductPage(
  pg: number,
  page: number,
  opts?: {
    getJson?: (url: string) => Promise<TrainersResultPayload | null>;
  },
): Promise<TrainersResultPayload | null> {
  const getJson =
    opts?.getJson ??
    (async (url: string) => {
      try {
        const res = await httpGet<TrainersResultPayload>(url, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json",
            Referer: `${TRAINERS_ORIGIN}/card-search/index.php`,
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 20_000,
          validateStatus: (s) => s === 200,
        });
        return res.data ?? null;
      } catch {
        return null;
      }
    });
  const url = `${RESULT_API}?${new URLSearchParams({
    pg: String(pg),
    page: String(page),
  })}`;
  return getJson(url);
}

export async function listTrainersProductCards(
  pg: number,
  opts?: {
    getJson?: (url: string) => Promise<TrainersResultPayload | null>;
    maxPages?: number;
  },
): Promise<TrainersCardListItem[]> {
  const first = await fetchTrainersProductPage(pg, 1, opts);
  if (!first?.cardList?.length) return [];
  const out = [...first.cardList];
  const maxPage = Math.max(1, Math.min(first.maxPage ?? 1, opts?.maxPages ?? 40));
  for (let page = 2; page <= maxPage; page += 1) {
    const payload = await fetchTrainersProductPage(pg, page, opts);
    if (!payload?.cardList?.length) break;
    out.push(...payload.cardList);
  }
  return out;
}

export async function fetchTrainersCardFace(
  cardId: string,
  opts?: {
    getHtml?: (url: string) => Promise<string | null>;
  },
): Promise<TrainersCardFace | null> {
  const id = cardId.trim();
  if (!/^\d+$/.test(id)) return null;
  const getHtml =
    opts?.getHtml ??
    (async (url: string) => {
      try {
        const res = await httpGet<string>(url, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          timeout: 20_000,
          responseType: "text",
          validateStatus: (s) => s === 200,
        });
        return typeof res.data === "string" ? res.data : null;
      } catch {
        return null;
      }
    });
  const html = await getHtml(
    `${TRAINERS_ORIGIN}/card-search/details.php/card/${id}/regu/all`,
  );
  if (!html) return null;
  const collector = parseTrainersCollectorLine(html);
  if (!collector) return null;
  const img =
    html.match(
      /(?:src|content)="(\/assets\/images\/card_images\/large\/[^"]+)"/i,
    )?.[1] ??
    html.match(/(\/assets\/images\/card_images\/large\/[^"'\s]+)/i)?.[1];
  if (!img) return null;
  return {
    cardId: id,
    imageUrl: trainersAbsoluteAssetUrl(img),
    collectorNumber: collector.number,
    setTotal: collector.total,
  };
}

async function downloadTrainersFace(url: string): Promise<Buffer | null> {
  return softRetryNull(async () => {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${TRAINERS_ORIGIN}/card-search/`,
      },
      responseType: "arraybuffer",
      timeout: 20_000,
      noDedup: true,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 1000) return null;
    return Buffer.from(res.data);
  });
}

/**
 * Download Trainers Official faces for curated JA set→pg mappings when the
 * print still has no local art.
 */
export async function fillTrainersJaFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    setProducts?: Readonly<Record<string, readonly number[]>>;
    prints?: readonly {
      printKey: string;
      setId: string;
      localId: string;
      providerId: string;
    }[];
    listProductCards?: (pg: number) => Promise<TrainersCardListItem[]>;
    fetchCardFace?: (cardId: string) => Promise<TrainersCardFace | null>;
    downloadImage?: (url: string) => Promise<Buffer | null>;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<TrainersJaFillReport> {
  const setProducts = opts.setProducts ?? TRAINERS_JA_SET_PRODUCTS;
  const missing =
    opts.prints ??
    listTcgdexJaPrintsMissingImageBase().map((row) => ({
      printKey: row.printKey,
      setId: row.setId,
      localId: row.localId,
      providerId: row.providerId,
    }));

  const targetSets = new Set(
    Object.keys(setProducts).map((s) => s.trim().toLowerCase()),
  );
  const prints = missing.filter((p) => {
    if (!targetSets.has(p.setId.trim().toLowerCase())) return false;
    if (opts.force) return true;
    const cardDir = pokemonPaperCardDir({
      setId: p.setId,
      lang: "ja",
      localId: p.localId,
      cardsRoot: opts.cardsRoot,
    });
    return !resolvePokemonArtFilename(cardDir, "ja");
  });

  const report: TrainersJaFillReport = {
    prints: prints.length,
    products: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    unmapped: 0,
    assetsSynced: 0,
  };
  if (prints.length === 0) return report;

  const listProductCards =
    opts.listProductCards ?? ((pg: number) => listTrainersProductCards(pg));
  const fetchCardFace = opts.fetchCardFace ?? fetchTrainersCardFace;
  const downloadImage = opts.downloadImage ?? downloadTrainersFace;

  /** setId → collector (padded) → image URL */
  const facesBySet = new Map<string, Map<string, string>>();

  for (const [setId, pages] of Object.entries(setProducts)) {
    const key = setId.trim().toLowerCase();
    const bucket = facesBySet.get(key) ?? new Map<string, string>();
    for (const pg of pages) {
      report.products += 1;
      const cards = await listProductCards(pg);
      for (const card of cards) {
        const id = card.cardID?.trim();
        if (!id) continue;
        const face = await fetchCardFace(id);
        if (!face) continue;
        if (!bucket.has(face.collectorNumber)) {
          bucket.set(face.collectorNumber, face.imageUrl);
        }
      }
    }
    facesBySet.set(key, bucket);
  }

  const writtenKeys: string[] = [];
  let done = 0;
  for (const row of prints) {
    const cardDir = pokemonPaperCardDir({
      setId: row.setId,
      lang: "ja",
      localId: row.localId,
      cardsRoot: opts.cardsRoot,
    });
    if (!opts.force) {
      if (resolvePokemonArtFilename(cardDir, "ja")) {
        refreshPokemonFaceDecision(cardDir, "ja");
        report.skipped += 1;
        done += 1;
        opts.onProgress?.(done, prints.length);
        continue;
      }
    }

    const local = row.localId.trim();
    const padded = /^\d+$/.test(local)
      ? String(Number.parseInt(local, 10)).padStart(3, "0")
      : local;
    const url =
      facesBySet.get(row.setId.trim().toLowerCase())?.get(padded) ?? null;
    if (!url) {
      report.unmapped += 1;
      done += 1;
      opts.onProgress?.(done, prints.length);
      continue;
    }

    const buf = await downloadImage(url);
    if (!buf) {
      report.failed += 1;
      done += 1;
      opts.onProgress?.(done, prints.length);
      continue;
    }

    mkdirSync(cardDir, { recursive: true });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("trainers", "art", "jpg"),
    );
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, "ja");
    writtenKeys.push(row.printKey);
    report.written += 1;
    done += 1;
    opts.onProgress?.(done, prints.length);
  }

  if (writtenKeys.length > 0 && !opts.cardsRoot) {
    report.assetsSynced = syncTcgdexPrintAssetsFromDisk({
      printKeys: writtenKeys,
      languages: ["ja"],
    });
  }

  return report;
}
