/**
 * Paper faces from PokéCardex scans (any retail set) → `art.pokecardex.jpg`.
 *
 * Series folder = curated alias, else TCGdex `officialAbbr` from the logo index
 * (e.g. `dp2` → `MT`). Zone `FR` for the French shelf.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  pokemonFaceFilename,
  refreshPokemonFaceDecision,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import { ensureTcgdexIndex } from "../../indexStore";
import { loadTcgdexSetLogoIndex } from "../../setLogos";
import {
  loadPokecardexSeriesAliases,
  isPokecardexSeriesCode,
  pokecardexAliasCodeForSet,
} from "./seriesCodes";
import {
  pokecardexScanUrl,
  type PokecardexScanZone,
} from "./scanUrl";

export { loadPokecardexSeriesAliases } from "./seriesCodes";

/**
 * PokéCardex scan folder for a catalogue set id.
 * Curated alias first, then logo-index `officialAbbr` / `localizedAbbr`.
 */
export function pokecardexSeriesCodeForSet(
  setId: string,
  aliases: Readonly<Record<string, string>> = loadPokecardexSeriesAliases(),
): string | null {
  const aliased = pokecardexAliasCodeForSet(setId, aliases);
  if (aliased) return aliased;

  const id = setId.trim().toLowerCase();
  if (!id) return null;
  // Kits : abbr TCGdex (`TK1A`) ≠ nom_court PokéCardex (`TK1-LA`) — alias only.
  if (id.startsWith("tk-")) return null;

  const index = loadTcgdexSetLogoIndex();
  const row = index?.sets.find((s) => s.id.toLowerCase() === id);
  for (const candidate of [row?.officialAbbr, row?.localizedAbbr, row?.tcgOnline]) {
    const code = candidate?.trim();
    if (code && isPokecardexSeriesCode(code) && !code.includes(":")) {
      return code.toUpperCase();
    }
  }
  return null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type PokecardexSetFillReport = {
  setId: string;
  seriesCode: string | null;
  lang: string;
  tried: number;
  written: number;
  skipped: number;
  failed: number;
};

async function downloadScan(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.pokecardex.com/",
        Accept: "image/jpeg,image/webp,image/*;q=0.8,*/*;q=0.5",
      },
      responseType: "arraybuffer",
      timeout: 40_000,
      validateStatus: (status: number) => status === 200,
    });
    const data = res.data;
    if (!data || data.byteLength < 500) return null;
    return Buffer.from(data);
  } catch {
    return null;
  }
}

export async function fillPokecardexFacesForSet(opts: {
  setId: string;
  localIds: readonly string[];
  lang?: string;
  zone?: PokecardexScanZone;
  seriesCode?: string | null;
  force?: boolean;
  cardsRoot?: string;
  downloadImage?: (url: string) => Promise<Buffer | null>;
}): Promise<PokecardexSetFillReport> {
  const lang = (opts.lang ?? "fr").trim().toLowerCase();
  const zone = opts.zone ?? (lang === "en" ? "US" : "FR");
  const seriesCode =
    opts.seriesCode?.trim().toUpperCase() ||
    pokecardexSeriesCodeForSet(opts.setId);
  const report: PokecardexSetFillReport = {
    setId: opts.setId,
    seriesCode,
    lang,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  if (!seriesCode) return report;

  const downloadImage = opts.downloadImage ?? downloadScan;

  for (const localId of opts.localIds) {
    report.tried += 1;
    const cardDir = pokemonPaperCardDir({
      setId: opts.setId,
      lang,
      localId,
      cardsRoot: opts.cardsRoot,
    });
    const outName = pokemonFaceFilename("pokecardex", "art", "jpg");
    const outPath = path.join(cardDir, outName);
    if (!opts.force && existsSync(outPath)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, lang);
      continue;
    }

    const url = pokecardexScanUrl({
      seriesCode,
      zone,
      localId,
      imageClass: "original",
    });
    const buf = await downloadImage(url);
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(outPath, buf);
    refreshPokemonFaceDecision(cardDir, lang);
    report.written += 1;
  }

  return report;
}

/**
 * Sets whose FR prints still have no TCGdex CDN face — kits, Zarbi, etc.
 * Also always include curated alias ids (POP / kits) so FR scans land even
 * when an EN CDN URL was stored earlier.
 */
export function listPokecardexRetailFillTargets(opts?: {
  language?: string;
}): { setId: string; localIds: string[] }[] {
  const db = ensureTcgdexIndex();
  if (!db) return [];
  const lang = (opts?.language ?? "fr").trim().toLowerCase() || "fr";
  const aliases = loadPokecardexSeriesAliases();
  const aliasIds = new Set(Object.keys(aliases).map((id) => id.toLowerCase()));

  const rows = db
    .prepare(
      `SELECT LOWER(p.set_id) AS setId,
              p.local_id AS localId,
              p.image_base_url AS imageBaseUrl
         FROM prints p
         JOIN print_titles t
           ON t.print_key = p.print_key AND t.lang = ?
        ORDER BY LOWER(p.set_id), p.local_id`,
    )
    .all(lang) as {
    setId: string;
    localId: string;
    imageBaseUrl: string | null;
  }[];

  const bySet = new Map<
    string,
    { localIds: string[]; anyFrImage: boolean }
  >();
  for (const row of rows) {
    const entry = bySet.get(row.setId) ?? {
      localIds: [],
      anyFrImage: false,
    };
    entry.localIds.push(row.localId);
    const url = row.imageBaseUrl?.trim() ?? "";
    if (url.includes("://assets.tcgdex.net/fr/")) entry.anyFrImage = true;
    bySet.set(row.setId, entry);
  }

  const out: { setId: string; localIds: string[] }[] = [];
  for (const [setId, entry] of bySet) {
    // McDo : autre fill (`fillMcdo`) avec les bons codes `M23` / `MC*`.
    if (/^\d{4}/.test(setId)) continue;
    const code = pokecardexSeriesCodeForSet(setId, aliases);
    if (!code) continue;
    const curated = aliasIds.has(setId);
    // Alias (kits / POP) toujours ; sinon seulement si aucune face CDN FR.
    if (!curated && entry.anyFrImage) continue;
    out.push({ setId, localIds: entry.localIds });
  }
  return out;
}

export async function fillPokecardexRetailFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    language?: string;
    downloadImage?: (url: string) => Promise<Buffer | null>;
    onProgress?: (message: string) => void;
  } = {},
): Promise<PokecardexSetFillReport[]> {
  const lang = (opts.language ?? "fr").trim().toLowerCase() || "fr";
  const targets = listPokecardexRetailFillTargets({ language: lang });
  opts.onProgress?.(
    `PokéCardex retail : ${targets.length} sets (alias / sans CDN)`,
  );
  const reports: PokecardexSetFillReport[] = [];
  for (const target of targets) {
    const report = await fillPokecardexFacesForSet({
      setId: target.setId,
      localIds: target.localIds,
      lang,
      force: opts.force,
      cardsRoot: opts.cardsRoot,
      downloadImage: opts.downloadImage,
    });
    reports.push(report);
    if (report.written + report.failed > 0) {
      opts.onProgress?.(
        `   ${report.setId} (${report.seriesCode}): ${report.written} écrites / ${report.skipped} skip / ${report.failed} fail`,
      );
    }
  }
  return reports;
}
