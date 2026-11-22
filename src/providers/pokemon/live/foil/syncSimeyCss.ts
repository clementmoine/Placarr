/**
 * CLI de dev — même chaîne que l'étape Sync `simey` (`simeyWeb.ts`, kit web
 * partagé, HTTP au commit amont figé). Préférer la Sync catalogue.
 *
 *   tsx src/providers/pokemon/live/foil/syncSimeyCss.ts [-- --force]
 */
import { syncSimeyWebAssets } from "./simeyWeb";

void syncSimeyWebAssets({ force: process.argv.includes("--force") }).then(
  (res) => {
    console.log(JSON.stringify(res));
    if (res.failed.length) process.exitCode = 1;
  },
);
