/**
 * Shared admin-catalogue face resolve: local `/assets/…` only.
 *
 * Sqlite often still holds CDN URLs or empty art after identity ingest.
 * Never mint those — prefer an on-disk `art*` file (optional pack probe),
 * then a sqlite **basename** that exists on disk.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCardDir } from "@/lib/packPaths";

const ART_BASENAME_RE = /^art(\.|$)/i;

/** Basename only — rejects paths and http(s) CDN leftovers. */
export function sqliteArtBasename(
  raw: string | null | undefined,
): string | null {
  const text = raw?.trim() || "";
  if (!text) return null;
  if (text.includes("/") || text.includes("\\")) return null;
  if (/^https?:\/\//i.test(text)) return null;
  return text;
}

/**
 * First on-disk art file in a card folder. `prefer` wins when present
 * (sqlite basename / face.json decision).
 */
export function probeLocalArtBasename(
  cardDir: string,
  prefer?: string | null,
): string | null {
  if (prefer) {
    const preferred = path.join(cardDir, prefer);
    if (existsSync(preferred)) return prefer;
  }
  try {
    const found = readdirSync(cardDir)
      .filter(
        (name) =>
          ART_BASENAME_RE.test(name) &&
          !name.endsWith(".json") &&
          !name.startsWith("."),
      )
      .sort();
    return found[0] ?? null;
  } catch {
    return null;
  }
}

export type ResolveCatalogueLocalArtInput = {
  packId: string;
  set: string;
  lang: string;
  card: string;
  sqliteArt?: string | null;
  /**
   * Pack-specific disk probe (DBS face.json, Pokémon Live remap…).
   * When it returns a basename, that wins; otherwise fall through to
   * generic folder scan + sqlite basename.
   */
  resolveDiskFile?: () => string | null;
};

/**
 * Honest local art URL for admin browse tiles.
 * Empty `artUrl` + `missingArt: true` when nothing is on disk.
 */
export function resolveCatalogueLocalArtUrl(
  input: ResolveCatalogueLocalArtInput,
): { artUrl: string; artFile: string | null; missingArt: boolean } {
  const lang = input.lang.trim().toLowerCase() || "fr";
  const set = input.set.trim() || "—";
  const card = input.card.trim();
  const cardDir = packCardDir(input.packId, { set, lang, card });
  const hint = sqliteArtBasename(input.sqliteArt);
  const diskFile =
    input.resolveDiskFile?.() ?? probeLocalArtBasename(cardDir, hint);
  const artFile = diskFile;
  if (!artFile) {
    return { artUrl: "", artFile: null, missingArt: true };
  }
  return {
    artUrl: assetsCardUrl(
      input.packId,
      { set, lang, card },
      artFile,
    ),
    artFile,
    missingArt: false,
  };
}
