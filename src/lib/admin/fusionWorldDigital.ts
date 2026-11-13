/**
 * Read-only inventory of the installed Fusion World digital client.
 * Filenames only — the game tree is never written.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type FusionWorldCardVariant = "plain" | "para" | "superpara" | "front";

export type FusionWorldSeriesCount = {
  series: string;
  count: number;
};

export type FusionWorldBundleFile = {
  name: string;
  bytes: number;
};

export type FusionWorldDigitalInventory = {
  installed: boolean;
  root: string;
  version: string | null;
  bundleCount: number;
  cards: {
    total: number;
    plain: number;
    para: number;
    superpara: number;
    front: number;
  };
  series: FusionWorldSeriesCount[];
  notedBundles: FusionWorldBundleFile[];
};

const NOTED = [
  "packdata_assets_shader.bundle",
  "packdata_assets_card_materials.bundle",
  "packdata_assets_card_frame.bundle",
  "packdata_assets_card_premiumtex.bundle",
  "packdata_assets_card_sleeve.bundle",
] as const;

export function defaultFusionWorldRoot(): string {
  return join(
    homedir(),
    "Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default",
  );
}

export function fusionWorldCardVariant(fileName: string): FusionWorldCardVariant | null {
  const match = /^packdata_assets_card_series_.+\.bundle$/.exec(fileName);
  if (!match) return null;
  const stem = fileName.slice(0, -".bundle".length);
  if (stem.endsWith("_superpara")) return "superpara";
  if (stem.endsWith("_para") || stem.includes("_para_") || stem.includes("_para")) return "para";
  if (stem.includes("_front")) return "front";
  return "plain";
}

export function fusionWorldSeriesCode(fileName: string): string | null {
  const match = /^packdata_assets_card_series_([^_]+)_/.exec(fileName);
  return match?.[1] ?? null;
}

function readVersion(root: string): string | null {
  const file = join(root, "game", ".version");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const match = /game=(\d+)/.exec(text);
  return match?.[1] ?? text.trim() || null;
}

/** Inventory of one client root. Missing directories yield `installed: false`. */
export function readFusionWorldDigitalInventory(
  root = defaultFusionWorldRoot(),
): FusionWorldDigitalInventory {
  const bundlesDir = join(
    root,
    "game/DBSCGFW.app/Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX",
  );
  const empty = {
    installed: false,
    root,
    version: readVersion(root),
    bundleCount: 0,
    cards: { total: 0, plain: 0, para: 0, superpara: 0, front: 0 },
    series: [],
    notedBundles: [],
  };
  if (!existsSync(bundlesDir)) return empty;

  const names = readdirSync(bundlesDir);
  const cards = { total: 0, plain: 0, para: 0, superpara: 0, front: 0 };
  const series = new Map<string, number>();
  for (const name of names) {
    const variant = fusionWorldCardVariant(name);
    if (!variant) continue;
    cards.total += 1;
    cards[variant] += 1;
    const code = fusionWorldSeriesCode(name);
    if (code) series.set(code, (series.get(code) ?? 0) + 1);
  }

  const notedBundles: FusionWorldBundleFile[] = [];
  for (const name of NOTED) {
    const path = join(bundlesDir, name);
    if (!existsSync(path)) continue;
    notedBundles.push({ name, bytes: statSync(path).size });
  }

  return {
    installed: true,
    root,
    version: readVersion(root),
    bundleCount: names.length,
    cards,
    series: [...series.entries()]
      .map(([code, count]) => ({ series: code, count }))
      .sort((a, b) => b.count - a.count || a.series.localeCompare(b.series)),
    notedBundles,
  };
}
