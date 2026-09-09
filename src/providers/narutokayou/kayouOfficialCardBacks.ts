import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { assetsCardUrl, assetsPackFileUrl } from "@/lib/packAssetUrls";

import {
  kayouOfficialIdSlug,
  kayouOfficialIdSuffixKeys,
  kayouOfficialLookupKeys,
} from "./kayouOfficialId";
import { NARUTO_KAYOU_PACK_ID, narutoKayouCuratedDir } from "./pack";

/** Where the verso lives after hash classify (installOfficialCardBacks). */
export type KayouOfficialCardBackPlacement =
  | { kind: "default" }
  | { kind: "tier"; slug: string }
  | { kind: "print"; set: string; lang: string; card: string };

export type KayouOfficialCardBackEntry = {
  idCode: string;
  url: string;
  seriesId: string;
  rarity: string;
  placement?: KayouOfficialCardBackPlacement;
};

export type KayouOfficialCardBackManifest = {
  source: string;
  observed: string;
  cards: Record<string, KayouOfficialCardBackEntry>;
  /** Unambiguous `ur-015l3` → full slug when unique across the harvest. */
  suffix: Record<string, string>;
};

const MANIFEST = "kayou-official-card-backs.json";

let cached: KayouOfficialCardBackManifest | null | undefined;

export function kayouOfficialCardBackManifestPath(): string {
  return path.join(narutoKayouCuratedDir(), "sources", MANIFEST);
}

export function readKayouOfficialCardBackManifest():
  | KayouOfficialCardBackManifest
  | null {
  if (cached !== undefined) return cached;
  const manifestPath = kayouOfficialCardBackManifestPath();
  if (!existsSync(manifestPath)) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as KayouOfficialCardBackManifest;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function resetKayouOfficialCardBackManifestCache(): void {
  cached = undefined;
}

/** @internal test hook — never write the real curated manifest from unit tests. */
export function __setKayouOfficialCardBackManifestForTests(
  manifest: KayouOfficialCardBackManifest | null,
): void {
  cached = manifest;
}

export function buildKayouOfficialCardBackManifest(
  rows: readonly KayouOfficialCardBackEntry[],
  meta: { observed: string; seriesIds: readonly string[] },
): KayouOfficialCardBackManifest {
  const cards: Record<string, KayouOfficialCardBackEntry> = {};
  for (const row of rows) {
    const slug = kayouOfficialIdSlug(row.idCode);
    cards[slug] = row;
  }

  const suffixHits = new Map<string, Set<string>>();
  for (const slug of Object.keys(cards)) {
    const entry = cards[slug]!;
    for (const key of kayouOfficialIdSuffixKeys(entry.idCode)) {
      let set = suffixHits.get(key);
      if (!set) {
        set = new Set();
        suffixHits.set(key, set);
      }
      set.add(slug);
    }
  }

  const suffix: Record<string, string> = {};
  for (const [key, slugs] of suffixHits) {
    if (slugs.size === 1) suffix[key] = [...slugs][0]!;
  }

  return {
    source: "kayouofficial.com — Naruto per-card backs (heterogeneous tiers)",
    observed: meta.observed,
    cards,
    suffix,
  };
}

export function resolveKayouOfficialCardBackSlug(
  reference: string,
  rarity?: string | null,
): string | null {
  const manifest = readKayouOfficialCardBackManifest();
  if (!manifest) return null;

  for (const key of kayouOfficialLookupKeys(reference, rarity)) {
    if (manifest.cards[key]) return key;
    const viaSuffix = manifest.suffix[key];
    if (viaSuffix && manifest.cards[viaSuffix]) return viaSuffix;
  }
  return null;
}

/**
 * Resolve stamp URL from placement:
 * tier → pack `back.<slug>.webp`; print → card-local `back.webp`;
 * default → null (caller falls through to rarity / pack default).
 */
export function kayouCardBackUrlForOfficialReference(
  reference: string,
  rarity?: string | null,
): string | null {
  const slug = resolveKayouOfficialCardBackSlug(reference, rarity);
  if (!slug) return null;
  const manifest = readKayouOfficialCardBackManifest();
  const entry = manifest?.cards[slug];
  const placement = entry?.placement;
  if (!placement || placement.kind === "default") return null;
  if (placement.kind === "tier") {
    return assetsPackFileUrl(
      NARUTO_KAYOU_PACK_ID,
      "cards",
      `back.${placement.slug}.webp`,
    );
  }
  if (placement.kind === "print") {
    return assetsCardUrl(
      NARUTO_KAYOU_PACK_ID,
      {
        set: placement.set,
        lang: placement.lang,
        card: placement.card,
      },
      "back.webp",
    );
  }
  return null;
}
