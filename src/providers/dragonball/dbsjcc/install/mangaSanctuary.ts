/**
 * Compat : packshots manga-sanctuary font partie du ledger presse unifié.
 */
import { readFileSync } from "node:fs";

import { dbsJccSourcePath } from "../pack";

export {
  installDbsJccPressPackshots as installDbsJccMangaSanctuaryPackshots,
  type InstallPressPackshotsReport as InstallMangaSanctuaryReport,
} from "./pressPackshots";
import type { PressPackshotLedger } from "./pressPackshots";

/** Article MS d'origine : page citée + faits relevés (forme libre). */
type MangaSanctuaryLedger = {
  source: string;
  observed: string;
  page: string;
  note?: string;
  facts: Record<string, unknown>;
  products: unknown[];
};

const pressPackshotsLedgerJson = JSON.parse(
  readFileSync(dbsJccSourcePath("press-packshots.json"), "utf8"),
) as PressPackshotLedger;

const mangaSanctuaryLedgerJson = JSON.parse(
  readFileSync(dbsJccSourcePath("manga-sanctuary-packshots.json"), "utf8"),
) as MangaSanctuaryLedger;

export function mangaSanctuaryPackshotLedger() {
  return mangaSanctuaryLedgerJson;
}

export function mangaSanctuaryIngestPackshots() {
  return pressPackshotsLedgerJson.products.filter(
    (row) => row.host === "manga-sanctuary" && row.ingest,
  );
}
