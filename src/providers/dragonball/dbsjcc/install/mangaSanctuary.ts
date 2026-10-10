/**
 * Compat : packshots manga-sanctuary font partie du ledger presse unifié.
 */
export {
  installDbsJccPressPackshots as installDbsJccMangaSanctuaryPackshots,
  type InstallPressPackshotsReport as InstallMangaSanctuaryReport,
} from "./pressPackshots";

import pressPackshotsLedgerJson from "../curated/sources/press-packshots.json";
import mangaSanctuaryLedgerJson from "../curated/sources/manga-sanctuary-packshots.json";

export function mangaSanctuaryPackshotLedger() {
  return mangaSanctuaryLedgerJson;
}

export function mangaSanctuaryIngestPackshots() {
  return pressPackshotsLedgerJson.products.filter(
    (row) => row.host === "manga-sanctuary" && row.ingest,
  );
}
