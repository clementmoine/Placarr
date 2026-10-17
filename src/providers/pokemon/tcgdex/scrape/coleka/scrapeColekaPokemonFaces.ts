/**
 * Moisson Coleka McDo → `art.coleka.*` under data/pokemon/cards/{set}/{lang}/{num}/.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import { fetchColekaListingHtml } from "@/providers/shared/coleka/listingFetch";
import {
  catalogArtefactIsFresh,
  packCatalogIngestLedgerPath,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";

import {
  refreshPokemonFaceDecision,
  pokemonFaceFilename,
} from "../../disk/faceChoice";
import { printKeyFromTcgdexIds } from "../../fetch";
import {
  pokemonPaperCardDir,
  pokemonCardFolderId,
} from "../../disk/paperCardDisk";
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
  observed?: string;
  branches: ColekaMcdoBranch[];
};

function curatedSourcesDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemon",
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

export function colekaMcdoArtefactId(branchId: string): string {
  return `pokemon:coleka-mcdo:${branchId}`;
}

export function colekaMcdoBranchContentHash(
  branch: ColekaMcdoBranch,
  observed: string,
): string {
  return [
    observed.trim(),
    branch.id,
    branch.setId,
    branch.lang,
    String(branch.listedCount),
    branch.listingPath ?? "",
  ].join("|");
}

/** Count ``art.coleka.*`` already promoted under cards/{set}/{lang}/. */
export function countColekaMcdoFacesOnDisk(
  branch: ColekaMcdoBranch,
  cardsRoot?: string,
): number {
  const setDir = path.join(
    cardsRoot ?? path.join(process.cwd(), "data", "pokemon", "cards"),
    branch.setId,
    branch.lang,
  );
  if (!existsSync(setDir)) return 0;
  let n = 0;
  for (const localId of readdirSync(setDir)) {
    const cardDir = path.join(setDir, localId);
    try {
      if (
        readdirSync(cardDir).some((f) =>
          f.toLowerCase().startsWith("art.coleka."),
        )
      ) {
        n += 1;
      }
    } catch {
      /* skip */
    }
  }
  return n;
}

export function colekaMcdoBranchFacesComplete(
  branch: ColekaMcdoBranch,
  cardsRoot?: string,
): boolean {
  if (branch.listedCount <= 0) return false;
  return countColekaMcdoFacesOnDisk(branch, cardsRoot) >= branch.listedCount;
}

/**
 * When faces are on disk under cards/, ledger + purge the staging audit copy.
 */
export function promoteAndPurgeColekaMcdoStaging(opts: {
  branch: ColekaMcdoBranch;
  observed: string;
  stagingRoot?: string;
  cardsRoot?: string;
  packId?: string;
}): boolean {
  if (!colekaMcdoBranchFacesComplete(opts.branch, opts.cardsRoot)) return false;
  const staging =
    opts.stagingRoot ??
    path.join(
      packStagingDir(opts.packId ?? "pokemon"),
      `coleka-mcdo-${opts.branch.id}`,
    );
  const contentHash = colekaMcdoBranchContentHash(opts.branch, opts.observed);
  recordCatalogPromoteAndPurgeStaging({
    ledgerPath: packCatalogIngestLedgerPath(opts.packId ?? "pokemon"),
    artefactId: colekaMcdoArtefactId(opts.branch.id),
    contentHash,
    stagingPath: staging,
  });
  return true;
}

/** Purge every FR/EN McDo branch whose faces are already complete. */
export function promoteAndPurgeAllColekaMcdoStaging(opts: {
  cardsRoot?: string;
  packId?: string;
} = {}): { purged: string[] } {
  const purged: string[] = [];
  for (const ledger of [readColekaMcdoFrLedger(), readColekaMcdoEnLedger()]) {
    const observed = ledger.observed ?? "unknown";
    for (const branch of ledger.branches) {
      if (!branch.scrape) continue;
      if (
        promoteAndPurgeColekaMcdoStaging({
          branch,
          observed,
          cardsRoot: opts.cardsRoot,
          packId: opts.packId,
        })
      ) {
        purged.push(branch.id);
      }
    }
  }
  return { purged };
}

function extFromUrl(url: string): string {
  const ext = path
    .extname(new URL(url).pathname)
    .replace(/^\./, "")
    .toLowerCase();
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
  stagingPurged?: boolean;
};

export async function harvestColekaMcdoBranch(
  branch: ColekaMcdoBranch,
  opts: {
    force?: boolean;
    cardsRoot?: string;
    stagingRoot?: string;
    observed?: string;
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

  const observed = opts.observed ?? "unknown";
  const contentHash = colekaMcdoBranchContentHash(branch, observed);
  const ledgerPath = packCatalogIngestLedgerPath("pokemon");
  if (
    !opts.force &&
    colekaMcdoBranchFacesComplete(branch, opts.cardsRoot) &&
    catalogArtefactIsFresh(
      readCatalogIngestLedger(ledgerPath),
      colekaMcdoArtefactId(branch.id),
      contentHash,
    )
  ) {
    report.skipped = branch.listedCount;
    report.stagingPurged = promoteAndPurgeColekaMcdoStaging({
      branch,
      observed,
      stagingRoot: opts.stagingRoot,
      cardsRoot: opts.cardsRoot,
    });
    return report;
  }

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
    // staging copy for audit (purged after promote when complete)
    writeFileSync(
      path.join(staging, `${pokemonCardFolderId(card.localId)}.${ext}`),
      buf,
    );
    report.written += 1;
  }

  if (colekaMcdoBranchFacesComplete(branch, opts.cardsRoot)) {
    report.stagingPurged = promoteAndPurgeColekaMcdoStaging({
      branch,
      observed,
      stagingRoot: staging,
      cardsRoot: opts.cardsRoot,
    });
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
  const out: ColekaPokemonHarvestReport[] = [];
  const run = async (ledger: ColekaMcdoLedger) => {
    const observed = ledger.observed ?? "unknown";
    for (const branch of ledger.branches) {
      if (!branch.scrape) continue;
      out.push(
        await harvestColekaMcdoBranch(branch, {
          ...opts,
          observed,
        }),
      );
    }
  };
  if (lang === "fr" || lang === "all") await run(readColekaMcdoFrLedger());
  if (lang === "en" || lang === "all") await run(readColekaMcdoEnLedger());
  return out;
}
