import path from "node:path";

export const DBH_PACK_ID = "dbs/heroes";
export const DBH_EFFECT_PACK_ID = "dbs-heroes";
export const DBH_PROVIDER_ID = "dbh";
export const DBH_PRINT_GAME = "dbh";

export function dbhCuratedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "dragonball",
    DBH_PROVIDER_ID,
    "curated",
  );
}
