/**
 * Card Game curated disk root — server/scripts only (`node:path`).
 */
import path from "node:path";

import { NARUTO_CARDGAME_PROVIDER_ID } from "./pack";

export function narutoCardgameCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "naruto",
    NARUTO_CARDGAME_PROVIDER_ID,
    "curated",
  );
}
