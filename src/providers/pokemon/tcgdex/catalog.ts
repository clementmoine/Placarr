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
  return listTcgdexLocalSets("fr").length === 0;
}

export function tcgdexCatalogStatus(): ProviderCatalogStatus {
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
}

export async function refreshTcgdexCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  const { harvestTcgdexCatalogue } = await import("./scrapeCards");
  const { ensureTcgdexSetLogoIndex } = await import("./setLogos");
  // Manual refresh forces a full re-check; auto only fills gaps / new sets.
  await harvestTcgdexCatalogue({ force: !opts?.auto });
  try {
    await ensureTcgdexSetLogoIndex({ force: !opts?.auto });
  } catch {
    /* logos are nice-to-have for wordmarks; prints matter more */
  }
  const logs = packLogsDir("pokemon");
  mkdirSync(logs, { recursive: true });
  writeFileSync(
    printsLastRunPath(),
    `${JSON.stringify({
      finishedAt: new Date().toISOString(),
      auto: Boolean(opts?.auto),
    })}\n`,
  );
}

export const tcgdexCatalog: ProviderCatalogHooks = {
  dataPack: "pokemon",
  status: tcgdexCatalogStatus,
  refresh: refreshTcgdexCatalog,
};
