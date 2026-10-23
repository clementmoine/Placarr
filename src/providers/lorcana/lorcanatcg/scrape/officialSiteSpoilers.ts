/**
 * Faces spoilées `www.disneylorcana.com` → `art.official.*` sur tirages déjà
 * ancrés (LorcanaJSON / Lorcast).
 *
 * Pas d'invention de printKey : sans numéro collection on ne crée pas de
 * tirage. Match = set catalogue + titre normalisé (toutes langues).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { httpGet } from "@/lib/http/httpClient";
import { cardDiskIdFromPrintKey, packCardDir } from "@/lib/packPaths";
import { normalizeLorcanaSearchText } from "@/providers/lorcana/lorcanajson/fetch";

import { lorcanaTcgDbPath } from "../indexStore";
import {
  OFFICIAL_SITE_UA,
  officialSetIdToSetCode,
  readOfficialSiteLedger,
  type OfficialProductPage,
  type OfficialSpoilerCard,
} from "./officialSite";

export const OFFICIAL_SPOILER_SOURCE = "official";

export type OfficialSpoilerMatch = {
  printKey: string;
  setCode: string;
  lang: string;
  title: string;
  url: string;
  kind: OfficialSpoilerCard["kind"];
};

export type ApplyOfficialSiteSpoilersResult = {
  spoilers: number;
  matched: number;
  written: number;
  skipped: number;
  unmatched: number;
  unmatchedTitles: string[];
};

function extFromUrl(url: string): string {
  try {
    const raw = path.extname(new URL(url).pathname).toLowerCase();
    // CDN sometimes serves `fr_xxx.png.png`.
    const ext = raw.replace(/\.png$/i, ".png");
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    /* ignore */
  }
  return ".png";
}

function magicExt(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return ".png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ".webp";
  }
  return ".png";
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": OFFICIAL_SITE_UA },
      timeout: 45_000,
      responseType: "arraybuffer",
      validateStatus: (s: number) => s === 200,
    });
    if (!res.data || res.data.byteLength < 500) return null;
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

type TitleRow = {
  printKey: string;
  setCode: string;
  lang: string;
  searchName: string;
  fullName: string;
};

function loadTitleIndex(dbPath: string): TitleRow[] {
  if (!existsSync(dbPath)) return [];
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db
      .prepare(
        `SELECT p.print_key AS printKey, p.set_code AS setCode,
                t.lang AS lang, t.search_name AS searchName, t.full_name AS fullName
         FROM prints p
         JOIN print_titles t ON t.print_key = p.print_key
         WHERE t.search_name IS NOT NULL AND TRIM(t.search_name) != ''`,
      )
      .all() as TitleRow[];
  } finally {
    db.close();
  }
}

function existingArtFile(cardDir: string): string | null {
  if (!existsSync(cardDir)) return null;
  try {
    for (const name of readdirSync(cardDir)) {
      if (/^art(\.|$)/i.test(name) && !/\.official\./i.test(name)) {
        return name;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Associe chaque spoiler au printKey déjà en base (même set, titre normalisé).
 * Ambiguïté (plusieurs tirages) → pas de match (honnête).
 * Secours : même set + titre sans espaces (`Harbormaster` ↔ `Harbor master`).
 */
export function matchOfficialSpoilersToPrints(
  pages: readonly OfficialProductPage[],
  titles: readonly TitleRow[],
): {
  matches: OfficialSpoilerMatch[];
  unmatched: OfficialSpoilerMatch[];
} {
  const bySetSearch = new Map<string, TitleRow[]>();
  const bySetLoose = new Map<string, TitleRow[]>();
  for (const row of titles) {
    const key = `${row.setCode.toUpperCase()}|${row.searchName}`;
    const list = bySetSearch.get(key) ?? [];
    list.push(row);
    bySetSearch.set(key, list);
    const loose = `${row.setCode.toUpperCase()}|${row.searchName.replace(/\s+/g, "")}`;
    const looseList = bySetLoose.get(loose) ?? [];
    looseList.push(row);
    bySetLoose.set(loose, looseList);
  }

  const resolvePrintKey = (setCode: string, search: string): string | null => {
    const exact = bySetSearch.get(`${setCode.toUpperCase()}|${search}`) ?? [];
    const exactKeys = [...new Set(exact.map((c) => c.printKey))];
    if (exactKeys.length === 1) return exactKeys[0]!;
    if (exactKeys.length > 1) return null;
    const loose =
      bySetLoose.get(`${setCode.toUpperCase()}|${search.replace(/\s+/g, "")}`) ??
      [];
    const looseKeys = [...new Set(loose.map((c) => c.printKey))];
    return looseKeys.length === 1 ? looseKeys[0]! : null;
  };

  const matches: OfficialSpoilerMatch[] = [];
  const unmatched: OfficialSpoilerMatch[] = [];
  const seenPair = new Set<string>();

  for (const page of pages) {
    const setCode = officialSetIdToSetCode(page.setId);
    if (!setCode) continue;
    const lang = (page.lang || "fr").toLowerCase();
    for (const spoiler of page.spoilers ?? []) {
      const search = normalizeLorcanaSearchText(spoiler.title);
      if (!search) continue;
      const printKey = resolvePrintKey(setCode, search);
      const base = {
        setCode,
        lang,
        title: spoiler.title,
        url: spoiler.url,
        kind: spoiler.kind,
      };
      if (!printKey) {
        unmatched.push({ ...base, printKey: "" });
        continue;
      }
      const pair = `${printKey}|${lang}|${spoiler.url}`;
      if (seenPair.has(pair)) continue;
      seenPair.add(pair);
      matches.push({ ...base, printKey });
    }
  }

  return { matches, unmatched };
}

/**
 * Télécharge les spoilers matchés → `art.official.*`, upsert `print_assets`
 * seulement si aucune face catalogue n'existe encore pour cette langue.
 */
export async function applyOfficialSiteSpoilerFaces(opts: {
  packId?: string;
  dbPath?: string;
  pages?: readonly OfficialProductPage[];
  force?: boolean;
  onProgress?: (message: string) => void;
} = {}): Promise<ApplyOfficialSiteSpoilersResult> {
  const packId = opts.packId ?? "lorcana";
  const dbPath = opts.dbPath ?? lorcanaTcgDbPath();
  const pages =
    opts.pages ??
    readOfficialSiteLedger(undefined, packId)?.pages ??
    [];

  const empty: ApplyOfficialSiteSpoilersResult = {
    spoilers: 0,
    matched: 0,
    written: 0,
    skipped: 0,
    unmatched: 0,
    unmatchedTitles: [],
  };
  if (!pages.length || !existsSync(dbPath)) return empty;

  const titles = loadTitleIndex(dbPath);
  const { matches, unmatched } = matchOfficialSpoilersToPrints(pages, titles);
  const spoilerCount = pages.reduce(
    (n, p) => n + (p.spoilers?.length ?? 0),
    0,
  );

  let written = 0;
  let skipped = 0;
  const db = new DatabaseSync(dbPath);
  const upsertAsset = db.prepare(`
    INSERT INTO print_assets (print_key, lang, art, thumb, foil_mask, varnish_mask, second_varnish_mask)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      art = CASE
        WHEN print_assets.art IS NULL OR TRIM(print_assets.art) = '' THEN excluded.art
        ELSE print_assets.art
      END
  `);
  const upsertTitle = db.prepare(`
    INSERT INTO print_titles (
      print_key, lang, full_name, name, version, set_name, rarity, card_type,
      color, story, flavor_text, subtypes_json, search_name,
      image_url, thumbnail_url, full_foil_url, foil_mask_url, varnish_mask_url,
      second_varnish_mask_url
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = COALESCE(NULLIF(TRIM(print_titles.full_name), ''), excluded.full_name),
      name = COALESCE(NULLIF(TRIM(print_titles.name), ''), excluded.name),
      version = COALESCE(print_titles.version, excluded.version),
      search_name = COALESCE(NULLIF(TRIM(print_titles.search_name), ''), excluded.search_name),
      image_url = COALESCE(print_titles.image_url, excluded.image_url)
  `);

  try {
    for (const match of matches) {
      const disk = cardDiskIdFromPrintKey(match.printKey, match.lang);
      if (!disk) {
        skipped += 1;
        continue;
      }
      const cardDir = packCardDir(packId, disk);
      mkdirSync(cardDir, { recursive: true });

      const primaryArt = existingArtFile(cardDir);
      const urlExt = extFromUrl(match.url);
      let destName = `art.${OFFICIAL_SPOILER_SOURCE}${urlExt}`;
      const destPath = path.join(cardDir, destName);

      if (!opts.force && existsSync(destPath) && primaryArt) {
        skipped += 1;
        continue;
      }

      let buf: Buffer | null = null;
      if (!opts.force && existsSync(destPath)) {
        buf = readFileSync(destPath);
      } else {
        buf = await fetchBytes(match.url);
        if (!buf) {
          skipped += 1;
          continue;
        }
        const mag = magicExt(buf);
        if (mag !== urlExt) {
          destName = `art.${OFFICIAL_SPOILER_SOURCE}${mag}`;
        }
        writeFileSync(path.join(cardDir, destName), buf);
      }

      // Ne promeut en face catalogue que s'il n'y a pas déjà d'art LorcanaJSON.
      if (!primaryArt) {
        upsertAsset.run(match.printKey, match.lang, destName);
      }

      const dash = match.title.indexOf(" - ");
      const name =
        dash > 0 ? match.title.slice(0, dash).trim() : match.title;
      const version =
        dash > 0 ? match.title.slice(dash + 3).trim() || null : null;
      upsertTitle.run(
        match.printKey,
        match.lang,
        match.title,
        name,
        version,
        normalizeLorcanaSearchText(match.title),
        match.url,
      );
      written += 1;
      opts.onProgress?.(
        `${match.printKey}/${match.lang} ← ${match.kind} ${match.title}`,
      );
    }
  } finally {
    db.close();
  }

  const unmatchedTitles = [
    ...new Set(
      unmatched
        .map((u) => u.title)
        .filter(Boolean)
        .sort(),
    ),
  ];

  return {
    spoilers: spoilerCount,
    matched: matches.length,
    written,
    skipped,
    unmatched: unmatched.length,
    unmatchedTitles: unmatchedTitles.slice(0, 40),
  };
}
