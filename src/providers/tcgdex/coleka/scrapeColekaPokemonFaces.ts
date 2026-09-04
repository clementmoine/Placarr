/**
 * Moisson Coleka McDo → `art.coleka.*` under data/pokemon/cards/{set}/{lang}/{num}/.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import { fetchColekaListingHtml } from "@/providers/narutocarddass/sources/colekaListingFetch";

import {
  refreshPokemonFaceDecision,
  pokemonFaceFilename,
} from "../faceChoice";
import { printKeyFromTcgdexIds } from "../fetch";
import {
  pokemonPaperCardDir,
  pokemonCardFolderId,
} from "../paperCardDisk";
import {
  COLEKA_ORIGIN,
  colekaPokemonListingPageUrls,
  parseColekaPokemonMcdoListing,
  type ColekaPokemonMcdoCard,
} from "./parseColekaPokemon";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type ColekaMcdoBranch = {
  id: string;
  setId: string;
  lang: string;
  label: string;
  url?: string | null;
  listingPath?: string | null;
  listedCount: number;
  scrape: boolean;
};

export type ColekaMcdoLedger = {
  source: string;
  branches: ColekaMcdoBranch[];
};

function curatedSourcesDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "tcgdex",
    "curated",
    "sources",
  );
}

export function readColekaMcdoFrLedger(): ColekaMcdoLedger {
  return JSON.parse(
    readFileSync(path.join(curatedSourcesDir(), "coleka-mcdo-fr.json"), "utf8"),
  ) as ColekaMcdoLedger;
}

export function readColekaMcdoEnLedger(): ColekaMcdoLedger {
  return JSON.parse(
    readFileSync(path.join(curatedSourcesDir(), "coleka-mcdo-en.json"), "utf8"),
  ) as ColekaMcdoLedger;
}

function extFromUrl(url: string): string {
  const ext = path.extname(new URL(url).pathname).replace(/^\./, "").toLowerCase();
  return ext || "webp";
}

async function downloadImage(
  url: string,
  referer: string,
): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: referer },
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

export type ColekaPokemonHarvestReport = {
  branch: string;
  pages: number;
  cards: number;
  written: number;
  skipped: number;
  failed: number;
};

export async function harvestColekaMcdoBranch(
  branch: ColekaMcdoBranch,
  opts: {
    force?: boolean;
    cardsRoot?: string;
    stagingRoot?: string;
  } = {},
): Promise<ColekaPokemonHarvestReport> {
  const report: ColekaPokemonHarvestReport = {
    branch: branch.id,
    pages: 0,
    cards: 0,
    written: 0,
    skipped: 0,
    failed: 0,
  };
  if (!branch.scrape || !branch.listingPath) return report;

  const staging =
    opts.stagingRoot ??
    path.join(packStagingDir("pokemon"), `coleka-mcdo-${branch.id}`);
  mkdirSync(staging, { recursive: true });

  const seen = new Map<string, ColekaPokemonMcdoCard>();
  for (const [i, url] of colekaPokemonListingPageUrls(
    branch.listingPath,
    branch.listedCount,
  ).entries()) {
    const dest = path.join(staging, `listing-${i}.html`);
    const html = await fetchColekaListingHtml(url, dest, Boolean(opts.force));
    if (!html) continue;
    report.pages += 1;
    for (const card of parseColekaPokemonMcdoListing(html)) {
      if (!seen.has(card.localId)) seen.set(card.localId, card);
    }
  }

  report.cards = seen.size;
  const referer = `${COLEKA_ORIGIN}${branch.listingPath}`;

  for (const card of seen.values()) {
    const printKey = printKeyFromTcgdexIds(branch.setId, card.localId);
    if (!printKey) {
      report.failed += 1;
      continue;
    }
    const cardDir = pokemonPaperCardDir({
      setId: branch.setId,
      lang: branch.lang,
      localId: card.localId,
      cardsRoot: opts.cardsRoot,
    });
    const ext = extFromUrl(card.faceUrl);
    const filename = pokemonFaceFilename("coleka", "art", ext);
    const dest = path.join(cardDir, filename);
    if (!opts.force && existsSync(dest)) {
      report.skipped += 1;
      refreshPokemonFaceDecision(cardDir, branch.lang);
      continue;
    }
    const buf = await downloadImage(card.faceUrl, referer);
    if (!buf) {
      report.failed += 1;
      continue;
    }
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(dest, buf);
    refreshPokemonFaceDecision(cardDir, branch.lang);
    // staging copy for audit
    writeFileSync(
      path.join(
        staging,
        `${pokemonCardFolderId(card.localId)}.${ext}`,
      ),
      buf,
    );
    report.written += 1;
  }

  return report;
}

export async function harvestColekaMcdoFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    lang?: "fr" | "en" | "all";
  } = {},
): Promise<ColekaPokemonHarvestReport[]> {
  const lang = opts.lang ?? "all";
  const branches: ColekaMcdoBranch[] = [];
  if (lang === "fr" || lang === "all") {
    branches.push(...readColekaMcdoFrLedger().branches);
  }
  if (lang === "en" || lang === "all") {
    branches.push(...readColekaMcdoEnLedger().branches);
  }
  const out: ColekaPokemonHarvestReport[] = [];
  for (const branch of branches) {
    if (!branch.scrape) continue;
    out.push(await harvestColekaMcdoBranch(branch, opts));
  }
  return out;
}
