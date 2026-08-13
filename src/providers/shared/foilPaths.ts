/**
 * Resolve Placarr pack paths under `data/<pack>/{foil,cards,staging}`.
 *
 * Public URLs: `/assets/<pack>/…`. Override data root with `PLACARR_DATA_DIR`;
 * pack asset root with `PLACARR_EFFECTS_DIR`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function repoRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
}

export function dataDir(repo?: string): string {
  const root = path.resolve(repo ?? repoRoot());
  const override = (process.env.PLACARR_DATA_DIR ?? "").trim();
  if (override) return path.resolve(override.replace(/^~(?=\/|$)/, homedir()));
  return path.resolve(root, "data");
}

export function foilDataRoot(repo?: string): string {
  const override = (process.env.PLACARR_EFFECTS_DIR ?? "").trim();
  if (override) return path.resolve(override.replace(/^~(?=\/|$)/, homedir()));
  return dataDir(repo);
}

export function foilPackDir(repo: string, pack: string): string {
  return path.join(foilDataRoot(repo), pack, "foil");
}

export function packCardsDir(repo: string, pack: string): string {
  return path.join(foilDataRoot(repo), pack, "cards");
}

export function packStagingDir(repo: string, pack: string): string {
  return path.join(dataDir(repo), pack, "staging");
}

export function packCatalogDb(repo: string, pack: string): string {
  return path.join(dataDir(repo), pack, "catalog.sqlite");
}

export function packCardsIndexPath(repo: string, pack: string): string {
  return path.join(dataDir(repo), pack, "cards-index.json");
}

export function packDataDir(repo: string, pack: string): string {
  return path.join(dataDir(repo), pack);
}

export function effectsSrcDir(repo: string, pack: string): string {
  return path.resolve(repo, "src", "effects", pack);
}

export function ensureEffectsLayout(repo: string): string {
  const root = dataDir(repo);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function writeLastRun(
  repo: string,
  pack: string,
  payload: Record<string, unknown>,
): string {
  const destDir = path.join(packDataDir(repo, pack), "logs");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, "last-run.json");
  const body = {
    ...payload,
    pack,
    finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(dest, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return dest;
}

function homedir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? "";
}
