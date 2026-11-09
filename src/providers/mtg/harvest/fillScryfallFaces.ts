/**
 * Densify Scryfall CDN faces → disk (`art.scryfall.*`).
 *
 * Ledger: `curated/art-urls.json` (written at seed). Runtime browse soft-fills
 * that ledger until Sync runs this step; afterwards local `art.*` wins and
 * `print_assets.art` carries the basename.
 *
 * Skip when any local `art*` already exists (unless `force`). Catalogue Sync
 * input only — never mint ghost URLs in the admin grid from here.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { packCardDir } from "@/lib/packPaths";
import {
  downloadCardFaceBytes,
  installCardFace,
} from "@/providers/shared/cardCatalogue/faceInstall";
import { probeLocalArtBasename } from "@/providers/shared/cardCatalogue/localCatalogueFace";
import type {
  LocalPrintAssetWrite,
  LocalPrintsIndex,
} from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  isUsableMtgArtUrl,
  loadMtgArtUrlMap,
  type MtgArtUrlMap,
} from "../artUrls";
import { MTG_PACK_ID } from "../pack";

export type ScryfallFaceFillReport = {
  slots: number;
  tried: number;
  written: number;
  skipped: number;
  unknownPrint: number;
  failed: number;
};

function diskCardOf(row: {
  number: string;
  grouping: string | null;
}): string {
  return row.grouping ? `${row.number}-${row.grouping}` : row.number;
}

function extFromUrl(url: string): "jpg" | "png" | "webp" {
  const pathPart = url.split("?")[0] ?? url;
  const m = /\.(png|webp|jpe?g)$/i.exec(pathPart);
  if (!m) return "jpg";
  const ext = m[1]!.toLowerCase();
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  return "jpg";
}

function existingScryfallArt(cardDir: string): string | null {
  for (const ext of ["jpg", "jpeg", "png", "webp"] as const) {
    const name = `art.scryfall.${ext === "jpeg" ? "jpg" : ext}`;
    if (existsSync(path.join(cardDir, name))) return name;
  }
  return null;
}

type Job = {
  printKey: string;
  lang: string;
  url: string;
  setCode: string;
  diskCard: string;
};

function buildJobs(
  index: LocalPrintsIndex,
  map: MtgArtUrlMap,
  langs: ReadonlySet<string> | null,
  limit: number,
): { jobs: Job[]; unknownPrint: number } {
  const jobs: Job[] = [];
  let unknownPrint = 0;
  for (const [printKeyRaw, byLang] of Object.entries(map)) {
    if (jobs.length >= limit) break;
    const printKey = printKeyRaw.trim().toLowerCase();
    if (!printKey || !byLang || typeof byLang !== "object") continue;
    const print = index.lookupRow(printKey);
    if (!print) {
      unknownPrint += 1;
      continue;
    }
    const setCode = (print.setCode || print.cardType || "").trim();
    if (!setCode) {
      unknownPrint += 1;
      continue;
    }
    const diskCard = diskCardOf(print);
    for (const [langRaw, urlRaw] of Object.entries(byLang)) {
      if (jobs.length >= limit) break;
      const lang = langRaw.trim().toLowerCase();
      if (!lang) continue;
      if (langs && !langs.has(lang)) continue;
      const url = urlRaw?.trim() ?? "";
      if (!isUsableMtgArtUrl(url)) continue;
      jobs.push({ printKey, lang, url, setCode, diskCard });
    }
  }
  return { jobs, unknownPrint };
}

export async function fillScryfallCatalogueFaces(opts: {
  index: LocalPrintsIndex;
  force?: boolean;
  /** Restrict densify to these langs (default: every slot in art-urls). */
  langs?: readonly string[];
  limit?: number;
  concurrency?: number;
  /** Couture de test. */
  downloadImage?: (url: string) => Promise<Buffer | null>;
  onProgress?: (done: number, total: number) => void;
}): Promise<ScryfallFaceFillReport> {
  const map = loadMtgArtUrlMap();
  const langs = opts.langs?.length
    ? new Set(
        opts.langs.map((l) => l.trim().toLowerCase()).filter(Boolean),
      )
    : null;
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const { jobs, unknownPrint } = buildJobs(opts.index, map, langs, limit);

  const report: ScryfallFaceFillReport = {
    slots: jobs.length,
    tried: 0,
    written: 0,
    skipped: 0,
    unknownPrint,
    failed: 0,
  };
  if (jobs.length === 0) return report;

  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const downloadImage =
    opts.downloadImage ??
    ((url: string) =>
      downloadCardFaceBytes(url, {
        referer: "https://scryfall.com/",
        timeoutMs: 40_000,
        minBytes: 800,
      }));

  const assets: LocalPrintAssetWrite[] = [];
  let cursor = 0;
  let done = 0;
  const tallies = { written: 0, skipped: 0, failed: 0, tried: 0 };

  async function runOne(job: Job): Promise<void> {
    tallies.tried += 1;
    const cardDir = packCardDir(MTG_PACK_ID, {
      set: job.setCode,
      lang: job.lang,
      card: job.diskCard,
    });

    const anyLocal = probeLocalArtBasename(cardDir);
    if (!opts.force && anyLocal) {
      tallies.skipped += 1;
      // Stamp basename so SQL « sans image » clears; keep provenance of
      // whatever face is already on disk (mtgcards / prior scryfall / …).
      assets.push({
        printKey: job.printKey,
        lang: job.lang,
        art: anyLocal,
      });
      return;
    }

    const artName = `art.scryfall.${extFromUrl(job.url)}`;
    const already = existingScryfallArt(cardDir);
    if (!opts.force && already) {
      tallies.skipped += 1;
      assets.push({
        printKey: job.printKey,
        lang: job.lang,
        art: already,
        sourceUrl: job.url,
        artKind: "official",
      });
      return;
    }

    const installed = await installCardFace({
      destDir: cardDir,
      artName,
      url: job.url,
      artKind: "official",
      force: opts.force,
      referer: "https://scryfall.com/",
      minBytes: 800,
      fetchImage: downloadImage,
    });
    if (installed) {
      if (installed.downloaded) tallies.written += 1;
      else tallies.skipped += 1;
      assets.push({
        printKey: job.printKey,
        lang: job.lang,
        art: installed.art,
        sourceUrl: job.url,
        artKind: "official",
      });
    } else {
      tallies.failed += 1;
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= jobs.length) return;
      await runOne(jobs[idx]!);
      done += 1;
      opts.onProgress?.(done, jobs.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );

  if (assets.length) {
    opts.index.writeAssets(assets);
  }

  report.tried = tallies.tried;
  report.written = tallies.written;
  report.skipped = tallies.skipped;
  report.failed = tallies.failed;
  return report;
}
