/**
 * Kayou rarity → `cards/back.<tier>.webp` slug + lookup.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { assetsPackFileUrl } from "@/lib/packAssetUrls";

import { narutoKayouCuratedDir } from "./pack";

type KayouBackAliasFile = {
  aliases?: Record<string, string>;
  skippedDefault?: string[];
};

let aliasFileCache: KayouBackAliasFile | null = null;

function loadKayouBackAliasFile(): KayouBackAliasFile {
  if (aliasFileCache) return aliasFileCache;
  const p = path.join(
    narutoKayouCuratedDir(),
    "sources",
    "kayou-back-aliases.json",
  );
  if (!existsSync(p)) {
    aliasFileCache = {};
    return aliasFileCache;
  }
  try {
    aliasFileCache = JSON.parse(readFileSync(p, "utf8")) as KayouBackAliasFile;
  } catch {
    aliasFileCache = {};
  }
  return aliasFileCache;
}

/** Test helper — clear alias memo. */
export function resetKayouBackAliasCache(): void {
  aliasFileCache = null;
}

/** Printed rarity → filename slug (`◇XR` → `shin-xr`, `UR` → `ur`). */
export function kayouBackTierSlug(
  rarity: string | null | undefined,
): string | null {
  let raw = rarity?.trim().toUpperCase() ?? "";
  if (!raw) return null;
  raw = raw.replace(/\u25C7/g, "SHIN-").replace(/◇/g, "SHIN-");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

/** Resolve rarity → canonical sleeve slug (hash aliases / identity). */
export function kayouCanonicalBackSlug(
  rarity: string | null | undefined,
): string | null {
  const slug = kayouBackTierSlug(rarity);
  if (!slug) return null;
  const file = loadKayouBackAliasFile();
  const skipped = new Set(
    (file.skippedDefault ?? []).map((s) => s.toLowerCase()),
  );
  if (skipped.has(slug)) return null;
  return file.aliases?.[slug] ?? slug;
}

export function kayouCardBackUrlForRarity(
  packId: string,
  rarity: string | null | undefined,
): string | null {
  const slug = kayouCanonicalBackSlug(rarity);
  if (!slug) return null;
  return assetsPackFileUrl(packId, "cards", `back.${slug}.webp`);
}
