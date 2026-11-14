/**
 * Limitless TCG Japanese paper faces → `art.limitless.png`.
 *
 * TCGdex often ships JA set briefs without `card.image` while Limitless hosts
 * `{SET}_{n}_R_JP_LG.png` (SV11B, MC, SVP, M2a, …). Probe CDN with Referer;
 * never invent a URL that 404s. Ranked below TCGdex in faceChoice.
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

const LIMITLESS_CDN =
  "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc";
const LIMITLESS_REFERER = "https://limitlesstcg.com/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type LimitlessJaFillReport = {
  prints: number;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  assetsSynced: number;
};

/** Remote set segment as Limitless uses it (SVP, MC, SV11B, M2a, …). */
export function limitlessSetCodeCandidates(
  setId: string,
  providerId: string,
): string[] {
  const fromProvider = providerId.includes("-")
    ? providerId.slice(0, providerId.lastIndexOf("-")).trim()
    : "";
  const raw = [
    fromProvider,
    fromProvider.replace(/-/g, ""),
    setId.trim(),
    setId.trim().replace(/-/g, ""),
    setId.trim().toUpperCase(),
    setId.trim().replace(/-/g, "").toUpperCase(),
  ].filter(Boolean);
  const out: string[] = [];
  for (const candidate of raw) {
    // Preserve Limitless casing when provider already has it (M2a, SM4p).
    if (!out.includes(candidate)) out.push(candidate);
    const upper = candidate.toUpperCase();
    if (!out.includes(upper)) out.push(upper);
  }
  return out;
}

/**
 * Basic-energy local ids on TCGdex (`DAR`, `FIR`, …) → Limitless one-letter
 * stems (`D`, `R`, …) used in `{SET}_{L}_R_JP_LG.png` (MC, M6a, …).
 */
const LIMITLESS_ENERGY_LETTER: Readonly<Record<string, string>> = {
  dar: "D",
  fig: "F",
  fir: "R",
  gra: "G",
  lig: "L",
  met: "M",
  psy: "P",
  wat: "W",
};

/** Collector number forms Limitless tries — unpadded first (`1`, then `001`). */
export function limitlessLocalIdCandidates(localId: string): string[] {
  const raw = localId.trim();
  if (!raw) return [];
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v);
  };
  const energy = LIMITLESS_ENERGY_LETTER[raw.toLowerCase()];
  if (energy) push(energy);
  if (/^\d+$/.test(raw)) {
    push(String(Number.parseInt(raw, 10)));
    push(raw);
  } else {
    push(raw);
  }
  return out;
}

export function limitlessJaFaceUrlCandidates(
  setId: string,
  providerId: string,
  localId: string,
): string[] {
  const urls: string[] = [];
  for (const set of limitlessSetCodeCandidates(setId, providerId)) {
    for (const num of limitlessLocalIdCandidates(localId)) {
      for (const size of ["LG", "SM"] as const) {
        const url = `${LIMITLESS_CDN}/${set}/${set}_${num}_R_JP_${size}.png`;
        if (!urls.includes(url)) urls.push(url);
      }
    }
  }
  return urls;
}

function existingLimitlessArt(cardDir: string): string | null {
  for (const ext of ["png", "webp", "jpg"] as const) {
    const name = pokemonFaceFilename("limitless", "art", ext);
    if (existsSync(path.join(cardDir, name))) return name;
  }
  return null;
}

async function downloadLimitlessFace(url: string): Promise<Buffer | null> {
  return softRetryNull(async () => {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: LIMITLESS_REFERER,
      },
      responseType: "arraybuffer",
      timeout: 20_000,
      minIntervalMs: 0,
      noDedup: true,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 1000) return null;
    return Buffer.from(res.data);
  });
}

/**
 * Download Limitless JP faces for JA prints that still lack any CDN base
 * (and thus typically any local art). Skip when a face already exists.
 */
export async function fillLimitlessJaFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    prints?: readonly {
      printKey: string;
      setId: string;
      localId: string;
      providerId: string;
    }[];
    downloadImage?: (url: string) => Promise<Buffer | null>;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<LimitlessJaFillReport> {
  const prints =
    opts.prints ??
    listTcgdexJaPrintsMissingImageBase().map((row) => ({
      printKey: row.printKey,
      setId: row.setId,
      localId: row.localId,
      providerId: row.providerId,
    }));

  const report: LimitlessJaFillReport = {
    prints: prints.length,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    assetsSynced: 0,
  };
  if (prints.length === 0) return report;

  const downloadImage = opts.downloadImage ?? downloadLimitlessFace;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 12));
  let cursor = 0;
  let done = 0;
  const writtenKeys: string[] = [];

  async function runOne(
    row: (typeof prints)[number],
  ): Promise<"written" | "skipped" | "failed"> {
    const cardDir = pokemonPaperCardDir({
      setId: row.setId,
      lang: "ja",
      localId: row.localId,
      cardsRoot: opts.cardsRoot,
    });
    if (!opts.force) {
      if (existingLimitlessArt(cardDir) || resolvePokemonArtFilename(cardDir, "ja")) {
        refreshPokemonFaceDecision(cardDir, "ja");
        return "skipped";
      }
    }

    const urls = limitlessJaFaceUrlCandidates(
      row.setId,
      row.providerId,
      row.localId,
    );
    let buf: Buffer | null = null;
    for (const url of urls) {
      buf = await downloadImage(url);
      if (buf) break;
    }
    if (!buf) return "failed";

    mkdirSync(cardDir, { recursive: true });
    const dest = path.join(
      cardDir,
      pokemonFaceFilename("limitless", "art", "png"),
    );
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, "ja");
    writtenKeys.push(row.printKey);
    return "written";
  }

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= prints.length) return;
      const row = prints[idx]!;
      const outcome = await runOne(row);
      report.tried += 1;
      if (outcome === "written") report.written += 1;
      else if (outcome === "skipped") report.skipped += 1;
      else report.failed += 1;
      done += 1;
      opts.onProgress?.(done, prints.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, prints.length) }, () =>
      worker(),
    ),
  );

  if (writtenKeys.length > 0 && !opts.cardsRoot) {
    report.assetsSynced = syncTcgdexPrintAssetsFromDisk({
      printKeys: writtenKeys,
      languages: ["ja"],
    });
  }

  return report;
}
