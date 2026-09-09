/**
 * Inventory playground-ready faces per Live foil leaf from Placarr data
 * (cards.json dump + liveOwned.json) — before hunting Live craft candidates.
 *
 * Usage:
 *   tsx src/providers/pokemontcglive/inventoryFoilFaces.ts
 *   tsx src/providers/pokemontcglive/inventoryFoilFaces.ts -- --effect SunPillar
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listPokemonFoilNames } from "@/effects/pokemon/foilNames";
import {
  listDumpedBundlesForShader,
  playroomArtForMaterial,
  playroomSeedFoilNames,
} from "@/effects/pokemon/playroomArt";
import { ownedBundlesForShader } from "@/effects/pokemon/liveOwnedBundles";
import { packLiveOwnedPath } from "@/lib/packPaths";

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

  const ownedPath = packLiveOwnedPath("pokemon");
  console.log(
    `# Foil face inventory (dump + owned preference)\n` +
      `# owned file: ${ownedPath}\n` +
      `# Note: TCG Live collection is server-side — sync via tsx src/providers/pokemontcglive/syncLiveOwned.ts\n` +
      `# (Rainier carddex → liveOwned.json). See docs/pokemon_live_rainier.md.\n`,
  );

  console.log(
    [
      "effect".padEnd(22),
      "dump".padStart(5),
      "owned".padStart(5),
      "playroom#1".padEnd(22),
      "status",
    ].join("  "),
  );

  for (const name of names) {
    const dumps = listDumpedBundlesForShader(name, 50);
    const owned = ownedBundlesForShader(name);
    const art = playroomArtForMaterial(name);
    const first = art?.bundleId ?? "(tcgdex-seed)";
    const ownedInDump = owned.filter((id) =>
      dumps.some((d) => d.bundleId === id),
    );
    let status: string;
    if (ownedInDump.length > 0) {
      status = `owned→playroom (${ownedInDump[0]})`;
    } else if (dumps.length > 0) {
      status = "dump ready — craft only for Live audit";
    } else {
      status = "NO dump — need scrape or TCGdex cold-start";
    }
    console.log(
      [
        name.padEnd(22),
        String(dumps.length).padStart(5),
        String(owned.length).padStart(5),
        first.padEnd(22),
        status,
      ].join("  "),
    );
  }

  if (!fs.existsSync(ownedPath)) {
    console.log("\n(warn) liveOwned.json missing");
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) main();
