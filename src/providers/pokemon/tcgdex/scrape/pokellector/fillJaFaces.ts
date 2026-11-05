/**
 * Pokéllector den-cards JP faces → `art.pokellector.png`.
 *
 * Only sets whose jp.pokellector page uses **Japanese collector order** are
 * listed — EN-order pages (Neo Genesis / Expedition) must never bind by
 * localId (false-positive art). Match `.SET.{n}.` → localId; skip `.0.` /
 * ambiguous stems.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
  resolvePokemonArtFilename,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import {
  syncTcgdexPrintAssetsFromDisk,
  tcgdexDbPath,
} from "../../indexStore";
import { DatabaseSync } from "node:sqlite";

const POKELLECTOR_ORIGIN = "https://jp.pokellector.com";
const DEN_CARDS = "https://den-cards.pokellector.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * TCGdex JA set id → jp.pokellector set path + CDN set code in filenames.
 * Verified JA collector order only.
 */
export const POKELLECTOR_JA_SETS: Readonly<
  Record<string, { path: string; code: string }>
> = {
  /** Pokémon VS — JP/EN share trainer-card numbering. */
  vs1: { path: "/sets/VS-Pokemon-VS", code: "VS" },
};

export type PokellectorJaFillReport = {
  prints: number;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  unmapped: number;
  assetsSynced: number;
};

export type PokellectorPrintTarget = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
};

/** Extract full-size den-cards URLs keyed by collector number. */
export function parsePokellectorSetFaceUrls(
  html: string,
  setCode: string,
): Map<number, string> {
  const code = setCode.trim();
  const re = new RegExp(
    String.raw`(?:https?:)?//den-cards\.pokellector\.com/(\d+)/([^"'?\s]+\.${code}\.(\d+)\.(?:\d+\.)?(?:thumb\.)?png)`,
    "gi",
  );
  const best = new Map<number, { url: string; thumb: boolean }>();
  for (const m of html.matchAll(re)) {
    const folder = m[1]!;
    const rest = m[2]!;
    const num = Number.parseInt(m[3]!, 10);
    if (!Number.isFinite(num) || num <= 0) continue; // `.0.` = unnumbered energies
    const thumb = /\.thumb\.png$/i.test(rest);
    const fullRest = rest.replace(/\.thumb\.png$/i, ".png");
    const url = `${DEN_CARDS}/${folder}/${fullRest}`;
    const prev = best.get(num);
    if (!prev || (prev.thumb && !thumb)) {
      best.set(num, { url, thumb });
    }
  }
  const out = new Map<number, string>();
  for (const [num, row] of best) out.set(num, row.url);
  return out;
}

export function pokellectorLocalIdNumber(localId: string): number | null {
  const raw = localId.trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function existingPokellectorArt(cardDir: string): string | null {
  for (const ext of ["png", "webp", "jpg"] as const) {
    const name = pokemonFaceFilename("pokellector", "art", ext);
    if (existsSync(path.join(cardDir, name))) return name;
  }
  return null;
}

async function downloadPokellectorFace(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: `${POKELLECTOR_ORIGIN}/`,
      },
      responseType: "arraybuffer",
      timeout: 20_000,
      minIntervalMs: 0,
      noDedup: true,
      validateStatus: (s) => s === 200,
    });
    if (!res.data || res.data.byteLength < 1000) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

export function listPokellectorJaPrintTargets(opts?: {
  dbPath?: string;
  setIds?: readonly string[];
}): PokellectorPrintTarget[] {
  const pathToDb = opts?.dbPath ?? tcgdexDbPath();
  if (!existsSync(pathToDb)) return [];
  const setIds = opts?.setIds ?? Object.keys(POKELLECTOR_JA_SETS);
  if (setIds.length === 0) return [];
  const db = new DatabaseSync(pathToDb, { readOnly: true });
  try {
    const placeholders = setIds.map(() => "?").join(", ");
    return db
      .prepare(
        `
      SELECT p.print_key AS printKey,
             p.set_id AS setId,
             p.local_id AS localId,
             p.provider_id AS providerId
        FROM prints p
        JOIN print_titles t ON t.print_key = p.print_key AND t.lang = 'ja'
       WHERE p.set_id IN (${placeholders})
         AND COALESCE(p.printed, 1) != 0
       ORDER BY LOWER(p.set_id), CAST(p.local_id AS INTEGER), p.local_id
    `,
      )
      .all(...setIds) as PokellectorPrintTarget[];
  } finally {
    db.close();
  }
}

/**
 * Download Pokéllector JP faces for verified JA-order sets. Skip when any face
 * already exists (unless `force`).
 */
export async function fillPokellectorJaFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    prints?: readonly PokellectorPrintTarget[];
    downloadImage?: (url: string) => Promise<Buffer | null>;
    fetchSetHtml?: (setPath: string) => Promise<string | null>;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<PokellectorJaFillReport> {
  const prints = opts.prints ?? listPokellectorJaPrintTargets();
  const report: PokellectorJaFillReport = {
    prints: prints.length,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    unmapped: 0,
    assetsSynced: 0,
  };
  if (prints.length === 0) return report;

  const downloadImage = opts.downloadImage ?? downloadPokellectorFace;
  const fetchSetHtml =
    opts.fetchSetHtml ??
    (async (setPath: string) => {
      try {
        const res = await httpGet<string>(`${POKELLECTOR_ORIGIN}${setPath}`, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          responseType: "text",
          timeout: 30_000,
          validateStatus: (s) => s === 200,
        });
        return typeof res.data === "string" ? res.data : null;
      } catch {
        return null;
      }
    });

  const bySet = new Map<string, PokellectorPrintTarget[]>();
  for (const row of prints) {
    if (!POKELLECTOR_JA_SETS[row.setId]) {
      report.unmapped += 1;
      continue;
    }
    const list = bySet.get(row.setId) ?? [];
    list.push(row);
    bySet.set(row.setId, list);
  }

  const writtenKeys: string[] = [];
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 12));

  for (const [setId, setPrints] of bySet) {
    const cfg = POKELLECTOR_JA_SETS[setId]!;
    const html = await fetchSetHtml(cfg.path);
    const urlByNum = html
      ? parsePokellectorSetFaceUrls(html, cfg.code)
      : new Map<number, string>();

    let cursor = 0;
    let done = 0;

    async function runOne(
      row: PokellectorPrintTarget,
    ): Promise<"written" | "skipped" | "failed" | "unmapped"> {
      const cardDir = pokemonPaperCardDir({
        setId: row.setId,
        lang: "ja",
        localId: row.localId,
        cardsRoot: opts.cardsRoot,
      });
      if (!opts.force) {
        if (
          existingPokellectorArt(cardDir) ||
          resolvePokemonArtFilename(cardDir, "ja")
        ) {
          refreshPokemonFaceDecision(cardDir, "ja");
          return "skipped";
        }
      }

      const num = pokellectorLocalIdNumber(row.localId);
      if (num == null) return "unmapped";
      const url = urlByNum.get(num);
      if (!url) return "unmapped";

      const buf = await downloadImage(url);
      if (!buf) return "failed";

      mkdirSync(cardDir, { recursive: true });
      const dest = path.join(
        cardDir,
        pokemonFaceFilename("pokellector", "art", "png"),
      );
      writeFileSync(dest, buf);
      refreshPokemonFaceDecision(cardDir, "ja");
      writtenKeys.push(row.printKey);
      return "written";
    }

    async function worker(): Promise<void> {
      while (true) {
        const idx = cursor++;
        if (idx >= setPrints.length) return;
        const outcome = await runOne(setPrints[idx]!);
        report.tried += 1;
        if (outcome === "written") report.written += 1;
        else if (outcome === "skipped") report.skipped += 1;
        else if (outcome === "unmapped") report.unmapped += 1;
        else report.failed += 1;
        done += 1;
        opts.onProgress?.(done, setPrints.length);
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, setPrints.length) },
        () => worker(),
      ),
    );
  }

  if (writtenKeys.length > 0 && !opts.cardsRoot) {
    report.assetsSynced = syncTcgdexPrintAssetsFromDisk({
      printKeys: writtenKeys,
      languages: ["ja"],
    });
  }

  return report;
}
