/**
 * Catalogue hooks for TCGdex identity harvest (`prints.sqlite`).
 *
 * Separate last-run stamp from Live extract (`last-run.json`) so foil sync
 * does not fake-fresh the paper catalogue, and vice versa.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packLogsDir } from "@/lib/packPaths";
import { catalogMaxAgeMs } from "@/providers/shared/catalogCorpus";
import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
  ProviderCatalogStatus,
} from "@/types/providerModule";

import { POKEMON_PACK_ID } from "@/providers/pokemon/paths";
import { applyCorpusPromotePokemon } from "./applyCorpusPromotePokemon";
import { listTcgdexLocalSets, tcgdexDbPath } from "./indexStore";

const PRINTS_LAST_RUN = "tcgdex-prints-last-run.json";

function printsLastRunPath(): string {
  return path.join(packLogsDir("pokemon"), PRINTS_LAST_RUN);
}

function printsLastSyncAt(): string | null {
  const file = printsLastRunPath();
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      finishedAt?: string;
    };
    return typeof parsed.finishedAt === "string" ? parsed.finishedAt : null;
  } catch {
    return null;
  }
}

function printsDbEmpty(): boolean {
  if (!existsSync(tcgdexDbPath())) return true;
  try {
    return listTcgdexLocalSets("fr").length === 0;
  } catch {
    // Locked by another process — not empty; do not force a sync stampede.
    return false;
  }
}

export function tcgdexCatalogStatus(): ProviderCatalogStatus {
  try {
    if (printsDbEmpty()) {
      return { empty: true, stale: true, lastSyncAt: null };
    }
    const lastSyncAt = printsLastSyncAt();
    if (!lastSyncAt) {
      // DB exists from an old harvest without stamp → stale so auto-sync picks
      // up new sets (e.g. me05.5) instead of sitting forever on aged data.
      return { empty: false, stale: true, lastSyncAt: null };
    }
    const t = Date.parse(lastSyncAt);
    if (!Number.isFinite(t)) {
      return { empty: false, stale: true, lastSyncAt };
    }
    return {
      empty: false,
      stale: Date.now() - t > catalogMaxAgeMs(),
      lastSyncAt,
    };
  } catch (error) {
    console.warn(
      "[tcgdex] catalog status skipped (sqlite busy or unreadable):",
      error instanceof Error ? error.message : error,
    );
    return { empty: false, stale: false, lastSyncAt: null };
  }
}

export async function refreshTcgdexCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  const { harvestTcgdexCatalogue } = await import("./scrapeCards");
  const { ensureTcgdexSetLogoIndex } = await import("./setLogos");
  const {
    enrichTcgdexCardDetails,
    TCGDEX_DETAIL_ENRICH_AUTO_LIMIT,
    TCGDEX_DETAIL_ENRICH_FORCE_LIMIT,
  } = await import("./enrichCardDetails");
  /*
    Every line goes to the console, which the job runner tees into the admin
    Logs. Each step announces itself and relays the progress the harvest
    already reports: a silent step cannot be told apart from a stuck one.
  */
  const log = (line: string) => console.log(line);
  const progress = (message: string) => log(`   ${message}`);
  const reason = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  const checkpoint = () => opts?.signal?.throwIfAborted();

  // Manual refresh forces a full re-check; auto only fills gaps / new sets.
  log(`── tcgdex : sets et tirages (${opts?.auto ? "lacunes" : "complet"})`);
  const harvest = await harvestTcgdexCatalogue({
    force: !opts?.auto,
    onProgress: progress,
  });
  checkpoint();

  log("── tcgdex : logos de set");
  try {
    await ensureTcgdexSetLogoIndex({ force: !opts?.auto });
  } catch (error) {
    // Logos are nice-to-have for wordmarks; prints matter more.
    progress(`logos ignorés : ${reason(error)}`);
  }
  checkpoint();

  // Set briefs omit rarity — budgeted per-card fill (autonomie living).
  log("── tcgdex : détails (rareté)");
  const details = await enrichTcgdexCardDetails({
    limit: opts?.auto
      ? TCGDEX_DETAIL_ENRICH_AUTO_LIMIT
      : TCGDEX_DETAIL_ENRICH_FORCE_LIMIT,
    onProgress: progress,
  });
  checkpoint();

  // Fullset.fr FR set titles — HTML index only (`/api` disallowed).
  log("── tcgdex : titres FR (Fullset)");
  let fullsetTitles: {
    matched: number;
    updated: number;
    unmatched: number;
  } | null = null;
  try {
    const { harvestFullsetSets } =
      await import("@/providers/shared/fullset/harvestSets");
    const { applyFullsetPokemonSetTitles } =
      await import("./scrape/fullset/applyFullsetSetTitles");
    await harvestFullsetSets({
      packId: POKEMON_PACK_ID,
      game: "pokemon",
      signal: opts?.signal,
    });
    const applied = applyFullsetPokemonSetTitles();
    fullsetTitles = {
      matched: applied.matched,
      updated: applied.updated,
      unmatched: applied.unmatched,
    };
  } catch (error) {
    progress(`index Fullset indisponible (${reason(error)}) — titres en cache`);
    try {
      const { applyFullsetPokemonSetTitles } =
        await import("./scrape/fullset/applyFullsetSetTitles");
      const applied = applyFullsetPokemonSetTitles();
      fullsetTitles = {
        matched: applied.matched,
        updated: applied.updated,
        unmatched: applied.unmatched,
      };
    } catch (fallbackError) {
      /* overlay is optional — TCGdex identity still stands */
      progress(`titres FR ignorés : ${reason(fallbackError)}`);
    }
  }
  if (fullsetTitles) {
    progress(
      `titres FR : ${fullsetTitles.updated} mis à jour, ${fullsetTitles.matched} reconnus, ${fullsetTitles.unmatched} sans correspondance`,
    );
  }
  log(
    `── tcgdex : terminé — ${harvest.sets} sets, ${harvest.prints} tirages, ${details.patched} détails`,
  );

  const logs = packLogsDir("pokemon");
  mkdirSync(logs, { recursive: true });
  writeFileSync(
    printsLastRunPath(),
    `${JSON.stringify({
      finishedAt: new Date().toISOString(),
      auto: Boolean(opts?.auto),
      sets: harvest.sets,
      prints: harvest.prints,
      titles: harvest.titles,
      detailsPatched: details.patched,
      fullsetTitles,
    })}\n`,
  );
}

export const tcgdexCatalog: ProviderCatalogHooks = {
  dataPack: "pokemon",
  status: tcgdexCatalogStatus,
  refresh: refreshTcgdexCatalog,
  applyCorpusPromote: applyCorpusPromotePokemon,
};
