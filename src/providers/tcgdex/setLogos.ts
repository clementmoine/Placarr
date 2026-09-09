/**
 * TCGdex expansion wordmarks, keyed for pkmcards `setCode`.
 *
 * The shop stores the PTCGO / official abbreviation (`CRI`, `PRE`, `SV01`).
 * TCGdex list rows only have `id` (`me04`, `sv08.5`, `sv01`) — the official
 * abbr lives on `/sets/{id}`. Cache both so ingest can join without a
 * network hop. Pocket (`tcgp`) sets are dropped: they were never printed.
 *
 * Logo URLs on the API are a CDN *base* (`…/logo`). The file is `…/logo.png`
 * — not `…/logo/high.png` (that 404s). Same for `symbol`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runWithConcurrency } from "@/lib/async/runWithConcurrency";
import { httpGet } from "@/lib/http/httpClient";
import { foilPackDataDir } from "@/lib/runtimeData";

import { API_BASE } from "./api";
import { digitalOnlySetIds } from "./digitalOnly";

const LANGUAGE = "fr";
const CACHE_VERSION = 1;
const DETAIL_CONCURRENCY = 6;

export type TcgdexSetLogoRow = {
  id: string;
  name: string | null;
  officialAbbr: string | null;
  tcgOnline: string | null;
  logo: string | null;
  symbol: string | null;
};

export type TcgdexSetLogoIndex = {
  version: typeof CACHE_VERSION;
  language: typeof LANGUAGE;
  fetchedAt: string;
  sets: TcgdexSetLogoRow[];
};

type RawListItem = {
  id?: unknown;
  name?: unknown;
  logo?: unknown;
  symbol?: unknown;
};

type RawSetDetail = RawListItem & {
  abbreviation?: { official?: unknown; tcgOnline?: unknown } | null;
};

let memory: { file: string; index: TcgdexSetLogoIndex } | null = null;

export function tcgdexSetLogoCachePath(): string {
  return path.join(
    foilPackDataDir("pokemon"),
    "staging",
    "tcgdex-set-logos.json",
  );
}

export function __resetTcgdexSetLogoIndexForTests(): void {
  memory = null;
}

export function __seedTcgdexSetLogoIndexForTests(
  index: TcgdexSetLogoIndex,
): void {
  memory = { file: ":test:", index };
}

/** TCGdex set logo/symbol base → actual PNG. Do not use `/high.png`. */
export function tcgdexSetAssetUrl(
  base: string | null | undefined,
): string | null {
  if (!base?.trim()) return null;
  const trimmed = base.trim().replace(/\/+$/, "");
  if (/\.(png|webp|jpe?g)$/i.test(trimmed)) return trimmed;
  return `${trimmed}.png`;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function isValidIndex(raw: unknown): raw is TcgdexSetLogoIndex {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as TcgdexSetLogoIndex;
  return row.version === CACHE_VERSION && Array.isArray(row.sets);
}

function readIndexFile(file: string): TcgdexSetLogoIndex | null {
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isValidIndex(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadTcgdexSetLogoIndex(
  file = tcgdexSetLogoCachePath(),
): TcgdexSetLogoIndex | null {
  if (memory && (memory.file === file || memory.file === ":test:")) {
    return memory.index;
  }
  const index = readIndexFile(file);
  if (index) memory = { file, index };
  return index;
}

function codesOf(row: TcgdexSetLogoRow): string[] {
  return [row.id, row.officialAbbr, row.tcgOnline]
    .filter((value): value is string => Boolean(value))
    .map(normalizeCode);
}

/**
 * Unique match on TCGdex id *or* official / TCGO abbreviation.
 * Several hits or none → null (honest empty, never a coin-flip logo).
 */
export function tcgdexLogoUrlForSetCode(
  setCode: string | null | undefined,
  index: TcgdexSetLogoIndex | null | undefined,
): string | null {
  const needle = setCode?.trim();
  if (!needle || !index) return null;
  const key = normalizeCode(needle);
  const hits = index.sets.filter((row) => codesOf(row).includes(key));
  if (hits.length !== 1) return null;
  return hits[0]!.logo ?? hits[0]!.symbol ?? null;
}

function mapRow(
  brief: RawListItem,
  detail: RawSetDetail | null,
): TcgdexSetLogoRow | null {
  const id = text(detail?.id) ?? text(brief.id);
  if (!id) return null;
  const logo = tcgdexSetAssetUrl(text(detail?.logo) ?? text(brief.logo));
  const symbol = tcgdexSetAssetUrl(text(detail?.symbol) ?? text(brief.symbol));
  if (!logo && !symbol) return null;
  const abbr = detail?.abbreviation;
  return {
    id,
    name: text(detail?.name) ?? text(brief.name),
    officialAbbr: abbr && typeof abbr === "object" ? text(abbr.official) : null,
    tcgOnline: abbr && typeof abbr === "object" ? text(abbr.tcgOnline) : null,
    logo,
    symbol,
  };
}

async function fetchSetDetail(id: string): Promise<RawSetDetail | null> {
  try {
    const response = await httpGet<RawSetDetail>(
      `${API_BASE}/${LANGUAGE}/sets/${encodeURIComponent(id)}`,
      { timeout: 15_000 },
    );
    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function refreshTcgdexSetLogoIndex(opts?: {
  force?: boolean;
  dest?: string;
}): Promise<TcgdexSetLogoIndex> {
  const dest = opts?.dest ?? tcgdexSetLogoCachePath();
  if (!opts?.force) {
    const existing = loadTcgdexSetLogoIndex(dest);
    if (existing && existing.sets.length > 0) return existing;
  }

  const pocket = await digitalOnlySetIds();
  const list = await httpGet<RawListItem[]>(`${API_BASE}/${LANGUAGE}/sets`, {
    timeout: 20_000,
  });
  const briefs = Array.isArray(list.data) ? list.data : [];
  const wanted = briefs.filter((brief) => {
    const id = text(brief.id);
    if (!id) return false;
    if (pocket.has(id.toLowerCase())) return false;
    return Boolean(brief.logo || brief.symbol);
  });

  const rows = await runWithConcurrency(
    wanted,
    DETAIL_CONCURRENCY,
    async (brief) => {
      const id = text(brief.id);
      if (!id) return null;
      const detail = await fetchSetDetail(id);
      return mapRow(brief, detail);
    },
  );

  const index: TcgdexSetLogoIndex = {
    version: CACHE_VERSION,
    language: LANGUAGE,
    fetchedAt: new Date().toISOString(),
    sets: rows.filter((row): row is TcgdexSetLogoRow => Boolean(row)),
  };
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  memory = { file: dest, index };
  return index;
}

/** Refresh for a Pokémon extract. Failure → keep the on-disk cache if any. */
export async function ensureTcgdexSetLogoIndex(opts?: {
  force?: boolean;
  dest?: string;
}): Promise<TcgdexSetLogoIndex | null> {
  try {
    return await refreshTcgdexSetLogoIndex(opts);
  } catch {
    return loadTcgdexSetLogoIndex(opts?.dest ?? tcgdexSetLogoCachePath());
  }
}
