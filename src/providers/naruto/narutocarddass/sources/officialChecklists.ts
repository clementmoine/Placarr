/**
 * Checklists officielles Naruto archivées dans la Wayback Machine :
 *
 * - `bandaicg.com/naruto/cardlists_s*.html|php` — Bandai USA (CCG EN) ;
 * - `carddas.com/naruto/cardlist/*.shtml` — Bandai JP (Carddass CG).
 *
 * La graine versionnée (`curated/sources/official-checklists-seed.json`) dit
 * **où regarder** : page, horodatage Wayback, URL d'origine. Tout le reste est
 * reconstruit ici et écrit dans `data/naruto/carddass/sources/` avec, pour
 * chaque carte, l'URL Wayback publique qui l'atteste (ADR-006 : une donnée de
 * `data/` sait toujours d'où elle vient et se re-récupère).
 *
 * Les pages sont mises en cache dans `staging/` (même arborescence que le
 * miroir historique) : une Sync ne retourne sur archive.org que pour une page
 * absente — la Wayback Machine refuse vite les clients trop bavards.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { waybackPublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import { httpGet } from "@/lib/http/httpClient";
import { retry } from "@/lib/http/retry";
import { dataRoot } from "@/lib/runtimeData";
import { waybackRawUrl } from "@/providers/shared/wayback/waybackRawUrl";

import seedJson from "../curated/sources/official-checklists-seed.json";
import { NARUTO_PACK_ID } from "../packs";
import {
  parseBandaicgCardlistHtml,
  parseCarddasJpCardlistHtml,
} from "../parse/bandai";
import {
  narutoCarddassSyncedSourcePath,
  resetNarutoCarddassSyncedSourceCache,
} from "../syncedSources";

export type WaybackSeedPage = {
  page: string;
  timestamp: string;
  original: string;
};

export type BandaicgSeed = {
  meta: Record<string, unknown>;
  pages: Array<WaybackSeedPage & { setCode: string }>;
};

export type CarddasJpSpecial = WaybackSeedPage & {
  printed: string;
  number: string;
  name: string;
  setCode: string;
  volume: string;
  attestation: string;
};

export type CarddasJpSeed = {
  meta: Record<string, unknown>;
  pages: Array<WaybackSeedPage & { fallbackSet: string }>;
  specials?: CarddasJpSpecial[];
};

export type OfficialChecklistSeed = {
  bandaicgEn: BandaicgSeed & { ledger: string };
  carddasJp: CarddasJpSeed & { ledger: string };
};

export type BandaicgEnCardlistCard = {
  printed: string;
  number: string;
  cardType: string;
  name: string;
  setCode: string;
  rarity: string | null;
  page: string;
  url: string;
};

export type CarddasJpCardlistCard = {
  printed: string;
  number: string;
  name: string;
  setCode: string;
  volume: string;
  page: string;
  url: string;
};

export type ChecklistLedger<Card> = Record<string, unknown> & {
  source: string;
  sources: string[];
  counts: { cards: number; bySet: Record<string, number> };
  cards: Card[];
};

export function loadOfficialChecklistSeed(): OfficialChecklistSeed {
  return seedJson as OfficialChecklistSeed;
}

function citation(page: WaybackSeedPage): string {
  return waybackPublicCitationUrl(page.timestamp, page.original);
}

function ledgerOf<Card extends { setCode: string }>(
  meta: Record<string, unknown>,
  pages: readonly WaybackSeedPage[],
  cards: Card[],
): ChecklistLedger<Card> {
  const sources = pages.map(citation);
  const bySet: Record<string, number> = {};
  for (const card of cards)
    bySet[card.setCode] = (bySet[card.setCode] ?? 0) + 1;
  return {
    source: sources[0] ?? "",
    sources,
    ...meta,
    counts: { cards: cards.length, bySet },
    cards,
  };
}

/** Pages dans l'ordre de la graine ; une carte réimprimée garde son premier set. */
export function buildBandaicgEnCardlistLedger(
  seed: BandaicgSeed,
  pages: ReadonlyMap<string, string>,
): ChecklistLedger<BandaicgEnCardlistCard> {
  const cards: BandaicgEnCardlistCard[] = [];
  const seen = new Set<string>();
  for (const page of seed.pages) {
    const html = pages.get(page.page);
    if (html == null) continue;
    const url = citation(page);
    for (const row of parseBandaicgCardlistHtml(html, page.setCode)) {
      if (seen.has(row.number)) continue;
      seen.add(row.number);
      cards.push({ ...row, page: page.page, url });
    }
  }
  return ledgerOf(seed.meta, seed.pages, cards);
}

/** `～` (cp932) et `〜` (Shift_JIS strict) : une seule graphie dans le ledger. */
function normalizeJaTilde(name: string): string {
  return name.replace(/～/g, "〜");
}

export function buildCarddasJpCardlistLedger(
  seed: CarddasJpSeed,
  pages: ReadonlyMap<string, string>,
): ChecklistLedger<CarddasJpCardlistCard> {
  const cards: CarddasJpCardlistCard[] = [];
  const seen = new Set<string>();
  for (const page of seed.pages) {
    const html = pages.get(page.page);
    if (html == null) continue;
    const url = citation(page);
    for (const row of parseCarddasJpCardlistHtml(html, page.fallbackSet)) {
      if (seen.has(row.number)) continue;
      seen.add(row.number);
      cards.push({
        ...row,
        name: normalizeJaTilde(row.name),
        page: page.page,
        url,
      });
    }
  }
  for (const special of seed.specials ?? []) {
    if (seen.has(special.number)) continue;
    seen.add(special.number);
    cards.push({
      printed: special.printed,
      number: special.number,
      name: special.name,
      setCode: special.setCode,
      volume: special.volume,
      page: special.page,
      url: citation(special),
    });
  }
  return ledgerOf(seed.meta, seed.pages, cards);
}

// ─── Cache staging + récupération Wayback ──────────────────────────────────

function bandaicgStagedPath(staging: string, page: string): string {
  return path.join(staging, "bandaicg-en", "pages", page);
}

function carddasJpStagedPath(staging: string, page: string): string {
  return path.join(staging, "carddas-jp", "www.carddas.com", "naruto", page);
}

const decodeLatin1 = (raw: Uint8Array) =>
  new TextDecoder("windows-1252").decode(raw);
const decodeShiftJis = (raw: Uint8Array) =>
  new TextDecoder("shift_jis").decode(raw);

function readStaged(
  seedPages: readonly WaybackSeedPage[],
  stagedPath: (page: string) => string,
  decode: (raw: Uint8Array) => string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of seedPages) {
    const file = stagedPath(page.page);
    if (existsSync(file)) out.set(page.page, decode(readFileSync(file)));
  }
  return out;
}

/** Pages déjà en cache dans `staging/`, décodées. */
export function readStagedChecklistPages(
  seed: OfficialChecklistSeed,
  staging: string,
): { bandaicgEn: Map<string, string>; carddasJp: Map<string, string> } {
  return {
    bandaicgEn: readStaged(
      seed.bandaicgEn.pages,
      (p) => bandaicgStagedPath(staging, p),
      decodeLatin1,
    ),
    carddasJp: readStaged(
      seed.carddasJp.pages,
      (p) => carddasJpStagedPath(staging, p),
      decodeShiftJis,
    ),
  };
}

async function fetchMissing(
  seedPages: readonly WaybackSeedPage[],
  stagedPath: (page: string) => string,
  log: (line: string) => void,
): Promise<{ fetched: number; failed: string[] }> {
  let fetched = 0;
  const failed: string[] = [];
  for (const page of seedPages) {
    const file = stagedPath(page.page);
    if (existsSync(file)) continue;
    try {
      const response = await retry(() =>
        httpGet<ArrayBuffer>(waybackRawUrl(page.timestamp, page.original), {
          responseType: "arraybuffer",
          hostProfile: "scrape",
          timeout: 60_000,
        }),
      );
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(response.data));
      fetched += 1;
    } catch (error) {
      failed.push(page.page);
      log(`   ⚠ ${page.page} : ${(error as Error).message}`);
    }
  }
  return { fetched, failed };
}

function writeLedger(fileName: string, ledger: unknown): string {
  const target = narutoCarddassSyncedSourcePath(fileName);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(ledger, null, 2)}\n`);
  return target;
}

export type OfficialChecklistsSyncResult = {
  fetched: number;
  failed: string[];
  written: string[];
  skipped: string[];
};

/**
 * Étape Sync `checklists` : complète le cache staging (sauf `offline`), puis
 * réécrit les deux ledgers. Un ledger dont une page manque n'est pas
 * réécrit — on garde le précédent plutôt qu'une checklist tronquée.
 */
export async function syncOfficialChecklists(opts?: {
  offline?: boolean;
  root?: string;
  log?: (line: string) => void;
}): Promise<OfficialChecklistsSyncResult> {
  const log = opts?.log ?? ((line: string) => console.log(line));
  const staging = path.join(
    opts?.root ?? path.join(dataRoot(), NARUTO_PACK_ID),
    "staging",
  );
  const seed = loadOfficialChecklistSeed();
  let fetched = 0;
  const failed: string[] = [];
  if (!opts?.offline) {
    for (const [pages, stagedPath] of [
      [seed.bandaicgEn.pages, (p: string) => bandaicgStagedPath(staging, p)],
      [seed.carddasJp.pages, (p: string) => carddasJpStagedPath(staging, p)],
    ] as const) {
      const result = await fetchMissing(pages, stagedPath, log);
      fetched += result.fetched;
      failed.push(...result.failed);
    }
  }
  const staged = readStagedChecklistPages(seed, staging);
  const written: string[] = [];
  const skipped: string[] = [];
  if (staged.bandaicgEn.size === seed.bandaicgEn.pages.length) {
    written.push(
      writeLedger(
        seed.bandaicgEn.ledger,
        buildBandaicgEnCardlistLedger(seed.bandaicgEn, staged.bandaicgEn),
      ),
    );
  } else {
    skipped.push(seed.bandaicgEn.ledger);
  }
  if (staged.carddasJp.size === seed.carddasJp.pages.length) {
    written.push(
      writeLedger(
        seed.carddasJp.ledger,
        buildCarddasJpCardlistLedger(seed.carddasJp, staged.carddasJp),
      ),
    );
  } else {
    skipped.push(seed.carddasJp.ledger);
  }
  // Le worker garde les ledgers en mémoire : la suite de la Sync doit relire.
  if (written.length) resetNarutoCarddassSyncedSourceCache();
  log(
    `── checklists officielles (Wayback) : ${fetched} page(s) récupérée(s), ` +
      `${written.length} ledger(s) écrit(s)` +
      (skipped.length
        ? `, gardé(s) faute de pages : ${skipped.join(", ")}`
        : ""),
  );
  return { fetched, failed, written, skipped };
}
