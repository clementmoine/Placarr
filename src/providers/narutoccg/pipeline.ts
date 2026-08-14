import { existsSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import type {
  ProviderCatalogHooks,
  ProviderCatalogRefreshOpts,
} from "@/types/providerModule";
import {
  dataPackPath,
  statusFromLastRun,
} from "@/providers/shared/catalogCorpus";
import { packLogsDir } from "@/lib/packPaths";

import { runNarutoPackPipeline } from "./cli";
import { narutoCcgDbPath } from "./indexStore";

const DATA_PACK = "naruto/ccg";

export async function refreshNarutoCcgCatalog(
  opts?: ProviderCatalogRefreshOpts,
): Promise<void> {
  /*
    Never `process.argv`: this runs inside the background worker, whose own
    arguments have nothing to do with the pack. Reading them let unrelated
    flags leak into the pipeline — and made the same call behave differently
    depending on who invoked it. `[]` is the full run (see `selectSteps`).
    Lorcana and Pokémon likewise derive everything from `opts`.
  */
  const argv = opts?.auto ? ["--offline", "--skip", "checklist"] : [];
  await runNarutoPackPipeline(argv);
  const logs = packLogsDir(DATA_PACK);
  mkdirSync(logs, { recursive: true });
  writeFileSync(
    path.join(logs, "last-run.json"),
    `${JSON.stringify({ finishedAt: new Date().toISOString(), auto: Boolean(opts?.auto) })}\n`,
  );
}

export function narutoCcgCatalogStatus() {
  const db = narutoCcgDbPath();
  const cardsIndex = dataPackPath(DATA_PACK, "cards-index.json");
  const empty = !existsSync(db) && !existsSync(cardsIndex);
  return statusFromLastRun({ dataPack: DATA_PACK, empty });
}

export const narutoccgCatalog: ProviderCatalogHooks = {
  dataPack: DATA_PACK,
  status: narutoCcgCatalogStatus,
  refresh: refreshNarutoCcgCatalog,
};
