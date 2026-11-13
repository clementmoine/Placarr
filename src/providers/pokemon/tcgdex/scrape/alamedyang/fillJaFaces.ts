/**
 * Alamedyang vintage JA paper scans → `art.alamedyang.jpg`.
 *
 * Fan archive (`alamedyang.tejat.net/cards/scans/jap/{folder}/`) covers Neo /
 * e-Card / VS / web JA prints that TCGdex + Limitless omit. Match only when
 * the archive file is unambiguous: unique dex → file, or padded localId.
 * Ambiguous multi-file dex (or Dark/Light variants) stay empty — no guessing.
 */
import { DatabaseSync } from "node:sqlite";
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
  syncTcgdexPrintAssetsFromDisk,
  tcgdexDbPath,
} from "../../indexStore";

const ALAMEDYANG_ORIGIN = "http://alamedyang.tejat.net";
const ALAMEDYANG_SCANS = `${ALAMEDYANG_ORIGIN}/cards/scans/jap`;
const TCGDEX_JA_API = "https://api.tcgdex.net/v2/ja";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** How archive filenames bind to TCGdex JA prints. */
export type AlamedyangMatchMode = "localPad" | "dexLevel" | "dexPad";

/**
 * TCGdex JA set id → alamedyang folder + match mode.
 * Only sets with an archive directory are listed — no blind probing.
 */
export const ALAMEDYANG_JA_SETS: Readonly<
  Record<string, { folder: string; mode: AlamedyangMatchMode }>
> = {
  neo1: { folder: "n1", mode: "dexLevel" },
  neo2: { folder: "n2", mode: "dexPad" },
  neo3: { folder: "n3", mode: "dexLevel" },
  neo4: { folder: "n4", mode: "dexPad" },
  e1: { folder: "e1", mode: "localPad" },
  e2: { folder: "e2", mode: "localPad" },
  e3: { folder: "e3", mode: "localPad" },
  e4: { folder: "e4", mode: "localPad" },
  e5: { folder: "e5", mode: "localPad" },
  vs1: { folder: "vs", mode: "localPad" },
  web1: { folder: "web", mode: "localPad" },
};

export type AlamedyangJaFillReport = {
  prints: number;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
  unmapped: number;
  assetsSynced: number;
};

export type AlamedyangPrintTarget = {
  printKey: string;
  setId: string;
  localId: string;
  providerId: string;
  /** National dex when known (dex* modes). */
  dexId?: number | null;
};

/** Parse scan filenames from an alamedyang set index page. */
export function parseAlamedyangIndexFiles(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="([^"/]+\.jpe?g)"/gi)) {
    const name = m[1]!.trim();
    if (!name || name.includes("..")) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Unique dex → filename for `{dex}-{lv}.jpg` (neo1/neo3). Skip dexes with
 * more than one file (ambiguous).
 */
export function alamedyangUniqueDexLevelFiles(
  files: readonly string[],
): Map<number, string> {
  const buckets = new Map<number, string[]>();
  for (const file of files) {
    const m = /^(\d{1,3})-\d{1,3}\.jpe?g$/i.exec(file);
    if (!m) continue;
    const dex = Number.parseInt(m[1]!, 10);
    if (!Number.isFinite(dex)) continue;
    const list = buckets.get(dex) ?? [];
    list.push(file);
    buckets.set(dex, list);
  }
  const out = new Map<number, string>();
  for (const [dex, list] of buckets) {
    if (list.length === 1) out.set(dex, list[0]!);
  }
  return out;
}

/**
 * Unique dex → filename for plain `{dex}.jpg` / `{dex padded}.jpg` (neo2/neo4).
 * Ignores Dark/Light / Unown variant stems — only numeric basename.
 */
export function alamedyangUniqueDexPadFiles(
  files: readonly string[],
): Map<number, string> {
  const buckets = new Map<number, string[]>();
  for (const file of files) {
    const m = /^(\d{1,3})\.jpe?g$/i.exec(file);
    if (!m) continue;
    const dex = Number.parseInt(m[1]!, 10);
    if (!Number.isFinite(dex)) continue;
    const list = buckets.get(dex) ?? [];
    list.push(file);
    buckets.set(dex, list);
  }
  const out = new Map<number, string>();
  for (const [dex, list] of buckets) {
    if (list.length === 1) out.set(dex, list[0]!);
  }
  return out;
}

/** localId → archive filename when a padded / unpadded form exists. */
export function alamedyangLocalPadFile(
  files: readonly string[],
  localId: string,
): string | null {
  const raw = localId.trim();
  if (!raw) return null;
  const set = new Set(files.map((f) => f.toLowerCase()));
  const candidates: string[] = [];
  const push = (stem: string) => {
    for (const ext of ["jpg", "jpeg"] as const) {
      const name = `${stem}.${ext}`;
      if (!candidates.includes(name)) candidates.push(name);
    }
  };
  push(raw);
  if (/^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    push(String(n));
    push(String(n).padStart(2, "0"));
    push(String(n).padStart(3, "0"));
  }
  for (const name of candidates) {
    if (set.has(name.toLowerCase())) {
      return files.find((f) => f.toLowerCase() === name.toLowerCase()) ?? name;
    }
  }
  return null;
}

export function alamedyangFaceUrl(folder: string, file: string): string {
  return `${ALAMEDYANG_SCANS}/${folder}/${file}`;
}

function existingAlamedyangArt(cardDir: string): string | null {
  for (const ext of ["jpg", "jpeg", "png", "webp"] as const) {
    const name = pokemonFaceFilename("alamedyang", "art", ext);
    if (existsSync(path.join(cardDir, name))) return name;
  }
  return null;
}

async function downloadAlamedyangFace(url: string): Promise<Buffer | null> {
  return softRetryNull(async () => {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: `${ALAMEDYANG_ORIGIN}/` },
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

/** JA prints in alamedyang-covered sets (titles present, printed). */
export function listAlamedyangJaPrintTargets(opts?: {
  dbPath?: string;
  setIds?: readonly string[];
}): AlamedyangPrintTarget[] {
  const pathToDb = opts?.dbPath ?? tcgdexDbPath();
  if (!existsSync(pathToDb)) return [];
  const setIds = opts?.setIds ?? Object.keys(ALAMEDYANG_JA_SETS);
  if (setIds.length === 0) return [];
  const db = new DatabaseSync(pathToDb, { readOnly: true });
  try {
    const placeholders = setIds.map(() => "?").join(", ");
    const rows = db
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
      .all(...setIds) as AlamedyangPrintTarget[];
    return rows;
  } finally {
    db.close();
  }
}

type TcgdexJaCardBrief = {
  id?: string;
  localId?: string | number;
  dexId?: number[] | null;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await httpGet<T>(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      timeout: 20_000,
      validateStatus: (s) => s === 200,
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * localId → national dex for a JA set (unique when the card carries one dex).
 */
export async function fetchAlamedyangSetDexMap(
  setId: string,
  opts?: {
    fetchSet?: (setId: string) => Promise<{ cards?: TcgdexJaCardBrief[] } | null>;
    fetchCard?: (cardId: string) => Promise<TcgdexJaCardBrief | null>;
  },
): Promise<Map<string, number>> {
  const fetchSet =
    opts?.fetchSet ??
    ((id: string) =>
      fetchJson<{ cards?: TcgdexJaCardBrief[] }>(
        `${TCGDEX_JA_API}/sets/${encodeURIComponent(id)}`,
      ));
  const fetchCard =
    opts?.fetchCard ??
    ((cardId: string) =>
      fetchJson<TcgdexJaCardBrief>(
        `${TCGDEX_JA_API}/cards/${encodeURIComponent(cardId)}`,
      ));

  const set = await fetchSet(setId);
  const briefs = set?.cards ?? [];
  const out = new Map<string, number>();
  const concurrency = 8;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= briefs.length) return;
      const brief = briefs[idx]!;
      const cardId =
        typeof brief.id === "string" && brief.id.trim()
          ? brief.id.trim()
          : `${setId}-${brief.localId ?? ""}`;
      const detail = (await fetchCard(cardId)) ?? brief;
      const localId = String(detail.localId ?? brief.localId ?? "").trim();
      const dex =
        Array.isArray(detail.dexId) && detail.dexId.length === 1
          ? detail.dexId[0]
          : null;
      if (!localId || dex == null || !Number.isFinite(dex)) continue;
      out.set(localId, dex);
      // Also key unpadded / padded forms for DB local_id variance.
      if (/^\d+$/.test(localId)) {
        const n = Number.parseInt(localId, 10);
        out.set(String(n), dex);
        out.set(String(n).padStart(3, "0"), dex);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, briefs.length)) }, () =>
      worker(),
    ),
  );
  return out;
}

function resolveArchiveFile(opts: {
  mode: AlamedyangMatchMode;
  localId: string;
  dexId: number | null | undefined;
  files: readonly string[];
  dexLevelMap: Map<number, string>;
  dexPadMap: Map<number, string>;
}): string | null {
  if (opts.mode === "localPad") {
    return alamedyangLocalPadFile(opts.files, opts.localId);
  }
  const dex = opts.dexId;
  if (dex == null || !Number.isFinite(dex)) return null;
  if (opts.mode === "dexLevel") return opts.dexLevelMap.get(dex) ?? null;
  return opts.dexPadMap.get(dex) ?? null;
}

/**
 * Download alamedyang JA faces for covered vintage sets. Skip when any face
 * already exists (unless `force`). Unmapped / ambiguous → failed, not invent.
 */
export async function fillAlamedyangJaFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    prints?: readonly AlamedyangPrintTarget[];
    downloadImage?: (url: string) => Promise<Buffer | null>;
    fetchIndex?: (folder: string) => Promise<string | null>;
    fetchSetDexMap?: (setId: string) => Promise<Map<string, number>>;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<AlamedyangJaFillReport> {
  const prints = opts.prints ?? listAlamedyangJaPrintTargets();
  const report: AlamedyangJaFillReport = {
    prints: prints.length,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    unmapped: 0,
    assetsSynced: 0,
  };
  if (prints.length === 0) return report;

  const downloadImage = opts.downloadImage ?? downloadAlamedyangFace;
  const fetchIndex =
    opts.fetchIndex ??
    (async (folder: string) => {
      try {
        const res = await httpGet<string>(
          `${ALAMEDYANG_SCANS}/${folder}/index.html`,
          {
            headers: { "User-Agent": UA, Accept: "text/html" },
            responseType: "text",
            timeout: 20_000,
            validateStatus: (s) => s === 200,
          },
        );
        return typeof res.data === "string" ? res.data : null;
      } catch {
        return null;
      }
    });

  const bySet = new Map<string, AlamedyangPrintTarget[]>();
  for (const row of prints) {
    if (!ALAMEDYANG_JA_SETS[row.setId]) {
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
    const cfg = ALAMEDYANG_JA_SETS[setId]!;
    const html = await fetchIndex(cfg.folder);
    const files = html ? parseAlamedyangIndexFiles(html) : [];
    const dexLevelMap = alamedyangUniqueDexLevelFiles(files);
    const dexPadMap = alamedyangUniqueDexPadFiles(files);

    let dexByLocal = new Map<string, number>();
    if (cfg.mode !== "localPad") {
      if (opts.fetchSetDexMap) {
        dexByLocal = await opts.fetchSetDexMap(setId);
      } else {
        // Prefer dexId already on the print row when tests inject it.
        const needFetch = setPrints.some(
          (p) => p.dexId == null || !Number.isFinite(p.dexId),
        );
        if (needFetch) {
          dexByLocal = await fetchAlamedyangSetDexMap(setId);
        }
        for (const p of setPrints) {
          if (p.dexId != null && Number.isFinite(p.dexId)) {
            dexByLocal.set(p.localId, p.dexId);
          }
        }
      }
    }

    let cursor = 0;
    let done = 0;

    async function runOne(
      row: AlamedyangPrintTarget,
    ): Promise<"written" | "skipped" | "failed" | "unmapped"> {
      const cardDir = pokemonPaperCardDir({
        setId: row.setId,
        lang: "ja",
        localId: row.localId,
        cardsRoot: opts.cardsRoot,
      });
      if (!opts.force) {
        if (
          existingAlamedyangArt(cardDir) ||
          resolvePokemonArtFilename(cardDir, "ja")
        ) {
          refreshPokemonFaceDecision(cardDir, "ja");
          return "skipped";
        }
      }

      const dexId =
        row.dexId ??
        dexByLocal.get(row.localId) ??
        (/^\d+$/.test(row.localId)
          ? dexByLocal.get(String(Number.parseInt(row.localId, 10)))
          : undefined) ??
        null;

      const file = resolveArchiveFile({
        mode: cfg.mode,
        localId: row.localId,
        dexId,
        files,
        dexLevelMap,
        dexPadMap,
      });
      if (!file) return "unmapped";

      const buf = await downloadImage(alamedyangFaceUrl(cfg.folder, file));
      if (!buf) return "failed";

      mkdirSync(cardDir, { recursive: true });
      const dest = path.join(
        cardDir,
        pokemonFaceFilename("alamedyang", "art", "jpg"),
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
        const row = setPrints[idx]!;
        const outcome = await runOne(row);
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
