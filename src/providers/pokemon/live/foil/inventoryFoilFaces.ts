/**
 * Inventory playground-ready faces per Live foil leaf from Placarr data
 * (Live cards dump) — before hunting Live craft candidates.
 *
 * Usage:
 *   tsx src/providers/pokemon/live/foil/inventoryFoilFaces.ts
 *   tsx src/providers/pokemon/live/foil/inventoryFoilFaces.ts -- --effect SunPillar
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

import { listPokemonFoilNames } from "@/effects/pokemon/foilNames";
import {
  listDumpedBundlesForShader,
  playroomArtForMaterial,
  playroomSeedFoilNames,
} from "@/effects/pokemon/playroomArt";

// Server-side: installs the SQLite lookups over the client-safe stubs.
// Without it the pack answers empty and every audit reports zero.
import "@/effects/pokemon/cardFoilIndex";

function parseArgs(argv: string[]): { effect: string | null } {
  let effect: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--effect" || a === "-e") {
      effect = argv[i + 1] ?? null;
      i++;
    }
  }
  return { effect };
}

function main(): void {
  const { effect } = parseArgs(process.argv.slice(2));
  const names = effect
    ? playroomSeedFoilNames().filter(
        (n) => n.toLowerCase() === effect.toLowerCase(),
      )
    : listPokemonFoilNames();

  if (effect && names.length === 0) {
    console.error(`Unknown foil leaf: ${effect}`);
    console.error(`Known: ${listPokemonFoilNames().join(", ")}`);
    process.exit(1);
  }

  console.log(`# Foil face inventory (Live dump)\n`);

  console.log(
    [
      "effect".padEnd(22),
      "dump".padStart(5),
      "playroom#1".padEnd(22),
      "status",
    ].join("  "),
  );

  for (const name of names) {
    const dumps = listDumpedBundlesForShader(name, 50);
    const art = playroomArtForMaterial(name);
    const first = art?.bundleId ?? "(tcgdex-seed)";
    let status: string;
    if (dumps.length > 0) {
      status = "dump ready — craft only for Live audit";
    } else {
      status = "NO dump — need scrape or TCGdex cold-start";
    }
    console.log(
      [
        name.padEnd(22),
        String(dumps.length).padStart(5),
        first.padEnd(22),
        status,
      ].join("  "),
    );
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) main();
