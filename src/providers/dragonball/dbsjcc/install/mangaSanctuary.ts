/**
 * Compat : packshots manga-sanctuary font partie du ledger presse unifié.
 */
import { readFileSync } from "node:fs";

import { dbsJccSourcePath } from "../pack";

export {
  installDbsJccPressPackshots as installDbsJccMangaSanctuaryPackshots,
  type InstallPressPackshotsReport as InstallMangaSanctuaryReport,
} from "./pressPackshots";

type PressLedger = { products: Array<{ ingest?: boolean; host?: string }> };

const pressPackshotsLedgerJson = JSON.parse(
  readFileSync(dbsJccSourcePath("press-packshots.json"), "utf8"),
) as PressLedger;

const mangaSanctuaryLedgerJson = JSON.parse(
  readFileSync(dbsJccSourcePath("manga-sanctuary-packshots.json"), "utf8"),
) as PressLedger;

export function mangaSanctuaryPackshotLedger() {
  return mangaSanctuaryLedgerJson;
}

export function mangaSanctuaryIngestPackshots() {
  return pressPackshotsLedgerJson.products.filter(
    (row) => row.host === "manga-sanctuary" && row.ingest,
  );
}
