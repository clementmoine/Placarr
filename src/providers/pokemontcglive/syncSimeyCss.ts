/**
 * Refresh simeydotme foil CSS into `data/pokemon/staging/simey/` (volatile).
 *
 * Not served at runtime — porting reference + foil-status gap audit only.
 * Recipes live in `holoShadersSimey.ts`. Same spirit as CDN/APK staging:
 * re-check upstream HEAD when refreshing.
 *
 *   tsx src/providers/pokemontcglive/syncSimeyCss.ts
 *   tsx src/providers/pokemontcglive/syncSimeyCss.ts -- --check
 *   tsx src/providers/pokemontcglive/syncSimeyCss.ts -- --force
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  pokemonSimeyStagingDir,
  pokemonSimeyTreeDir,
  type PokemonSimeyTreeId,
} from "@/lib/packPaths";

const TREES: Array<{
  id: PokemonSimeyTreeId;
  repo: string;
  label: string;
}> = [
  {
    id: "poke-holo",
    repo: "https://github.com/simeydotme/pokemon-cards-css.git",
    label: "pokemon-cards-css",
  },
  {
    id: "poke-151",
    repo: "https://github.com/simeydotme/pokemon-cards-151.git",
    label: "pokemon-cards-151",
  },
];

function parseArgs(argv: string[]) {
  return {
    check: argv.includes("--check"),
    force: argv.includes("--force"),
  };
}

function sameCommit(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length);
  return n >= 7 && a.slice(0, n).toLowerCase() === b.slice(0, n).toLowerCase();
}

function remoteHead(repo: string): string | null {
  const r = spawnSync("git", ["ls-remote", repo, "HEAD"], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || "git ls-remote failed");
    return null;
  }
  const sha = (r.stdout || "").trim().split(/\s+/)[0];
  return sha && /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
}

function localCommit(treeId: PokemonSimeyTreeId): string | null {
  const file = path.join(pokemonSimeyTreeDir(treeId), "UPSTREAM_COMMIT");
  if (!existsSync(file)) return null;
  const sha = readFileSync(file, "utf8").trim().split(/\s+/)[0];
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null;
}

function cssCardsDir(treeId: PokemonSimeyTreeId): string {
  return path.join(pokemonSimeyTreeDir(treeId), "public", "css", "cards");
}

function refreshTree(tree: (typeof TREES)[number], head: string): void {
  const dest = pokemonSimeyTreeDir(tree.id);
  const tmp = path.join(os.tmpdir(), `placarr-simey-${tree.id}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  const clone = spawnSync("git", ["clone", "--depth", "1", tree.repo, tmp], {
    encoding: "utf8",
  });
  if (clone.status !== 0) {
    throw new Error(
      `clone ${tree.label} failed: ${clone.stderr || clone.stdout}`,
    );
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.join(dest, "public"), { recursive: true });
  cpSync(path.join(tmp, "public", "css"), path.join(dest, "public", "css"), {
    recursive: true,
  });

  for (const name of ["LICENSE", "README.md"] as const) {
    const src = path.join(tmp, name);
    if (existsSync(src)) copyFileSync(src, path.join(dest, name));
  }
  writeFileSync(path.join(dest, "UPSTREAM_COMMIT"), `${head}\n`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${tree.id}: refreshed → ${head.slice(0, 12)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2).filter((a) => a !== "--"));
  mkdirSync(pokemonSimeyStagingDir(), { recursive: true });

  let behind = 0;
  let missing = 0;
  let ok = 0;
  let refreshed = 0;

  for (const tree of TREES) {
    const head = remoteHead(tree.repo);
    if (!head) {
      process.exitCode = 1;
      continue;
    }
    const local = localCommit(tree.id);
    const hasCss = existsSync(cssCardsDir(tree.id));
    const short = (s: string) => s.slice(0, 12);
    const atHead = Boolean(local && hasCss && sameCommit(local, head));

    if (args.check) {
      if (!local || !hasCss) {
        missing += 1;
        console.log(`  ${tree.id}: missing (upstream HEAD ${short(head)})`);
      } else if (!atHead) {
        behind += 1;
        console.log(
          `  ${tree.id}: behind (local ${short(local!)} → HEAD ${short(head)})`,
        );
      } else {
        ok += 1;
        console.log(`  ${tree.id}: at HEAD ${short(local!)}`);
      }
      continue;
    }

    if (args.force || !atHead) {
      if (!local || !hasCss) {
        console.log(`  ${tree.id}: missing → fetch ${short(head)}`);
      } else if (!atHead) {
        console.log(`  ${tree.id}: behind ${short(local!)} → ${short(head)}`);
      } else {
        console.log(`  ${tree.id}: force refresh ${short(head)}`);
      }
      refreshTree(tree, head);
      refreshed += 1;
      continue;
    }

    ok += 1;
    console.log(`  ${tree.id}: at HEAD ${short(local!)}`);
  }

  if (args.check) {
    console.log(`simey check: ok=${ok} behind=${behind} missing=${missing}`);
    if (behind + missing > 0) process.exitCode = 1;
    return;
  }

  console.log(
    `simey staging → ${pokemonSimeyStagingDir()} (ok=${ok} refreshed=${refreshed})`,
  );
}

main();
