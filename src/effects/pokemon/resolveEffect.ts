/**
 * Resolve TCG Live foil recipe for a paper card.
 *
 * Exact: scraped `cards.json` keyed by Live bundle id (`{set}_{lang}_{num}`).
 * Catalogue finishes (`holo` / `reverse`) pick std vs ph from dumped rows —
 * never invent a confident foil from rarity alone.
 */

import { parsePrintKey } from "@/core/identify/printKey";
import { foilTextureFile } from "@/effects/foilTextureFile";

import {
  listBundleIds,
  listSetIds,
  variantsForBundle,
} from "./cardFoilLookups";
import { foilManifestToShader, type PokemonPaperFoilName } from "./foilNames";
import { remapCollectorNumberForLive } from "./collectorRemap";
import { lookupByName, lookupBySetNum } from "./liveCardsLookups";
import {
  liveSetCandidatesForResolve,
  liveSetCandidatesFromTcgdexSet,
  liveSetIdFromTcgdexSet,
} from "./liveSetId";
import { paperMaterial } from "./materials";

export type PaperCardVariant = {
  foil: string;
  shader: string;
  cardTex: string;
  maskTex: string;
  /** Per-card etch plate (`*_etch_*`) — HoloFoil leaves gate on it. */
  etchTex?: string;
  /** Per-card cold-foil plate (`*_foil_*`). */
  coldFoilTex?: string;
};

export type PaperCardEntry = {
  std?: PaperCardVariant;
  ph?: PaperCardVariant;
};

export type PaperEffectResolution = {
  shader: PokemonPaperFoilName;
  variant: "std" | "ph";
  confidence: "exact";
  /**
   * Exact dump hit; reprint-fallback when borrowing another Live stem;
   * name-fallback when set+num miss but Live identity sqlite matches the
   * catalogue title within candidate sets.
   */
  source:
    | "tcglive-bundle"
    | "tcglive-reprint-fallback"
    | "tcglive-name-fallback";
  maskTex: string | null;
  /** Live card art stem under ``textures/<bundle>/``. */
  cardTex: string | null;
  etchTex: string | null;
  coldFoilTex: string | null;
  bundle: string;
};

/**
 * The dump, one row at a time.
 *
 * This was `cardsJson as Record<string, PaperCardEntry>` over a 10.7 MB static
 * import. Two `"use client"` components reach this pack, so webpack tried to
 * ship all 41 546 entries to the browser and never finished compiling — see
 * `cardFoilLookups` for the full account. Rows now come from SQLite, which a
 * browser bundle cannot contain by construction.
 */
function cardEntry(bundleId: string): PaperCardEntry | null {
  const variants = variantsForBundle(bundleId);
  if (variants.length === 0) return null;
  const entry: PaperCardEntry = {};
  for (const v of variants) {
    entry[v.variant] = {
      foil: v.foil,
      shader: v.shader,
      cardTex: v.cardTex,
      maskTex: v.maskTex,
      ...(v.etchTex ? { etchTex: v.etchTex } : {}),
      ...(v.coldFoilTex ? { coldFoilTex: v.coldFoilTex } : {}),
    };
  }
  return entry;
}

let liveStemSetCache: Set<string> | null = null;

function dumpHasLiveStem(stem: string): boolean {
  if (!liveStemSetCache) {
    liveStemSetCache = new Set(listLiveSetIds());
  }
  return liveStemSetCache.has(stem);
}

const BUNDLE_RE =
  /^(?<set>[a-z0-9.-]+)_(?<lang>[a-z]{2,4})_(?<num>\d+)(?:_[a-z])?$/i;

const PLAIN_FINISHES = new Set(["normal"]);

/** Build Live bundle id from set + collector number (+ lang). */
export function paperBundleId(
  setId: string,
  number: string | number,
  lang = "fr",
): string | null {
  const set = setId.trim().toLowerCase();
  const raw = String(number).trim();
  const digits = raw.replace(/\D/g, "");
  if (!set || !digits) return null;
  return `${set}_${lang}_${digits.padStart(3, "0")}`;
}

/**
 * Live CDN dumps default to FR+EN. Prefer the caller's lang, then the other
 * paper locales so a FR shelf can still use an EN-only dump (and vice versa).
 */
export function liveBundleLangsToTry(lang?: string | null): string[] {
  const primary = (lang?.trim().toLowerCase() || "fr") || "fr";
  const ordered = [primary, "fr", "en"];
  return [...new Set(ordered)];
}

export function paperCard(bundleId: string): PaperCardEntry | null {
  return cardEntry(bundleId);
}

export function listPaperBundleIds(): string[] {
  return listBundleIds();
}

export function listLiveSetIds(): string[] {
  return listSetIds();
}

/** True when the Live row names a real HoloFoil leaf (not NonFoil). */
export function isPaperFoilVariant(
  variant: PaperCardVariant | undefined,
): boolean {
  if (!variant) return false;
  const shader =
    foilManifestToShader(variant.shader) || foilManifestToShader(variant.foil);
  return Boolean(shader && shader !== "NonFoil" && paperMaterial(shader));
}

/**
 * Pick std vs ph from a catalogue finish and dumped row.
 * Returns null when the finish is plain or no foil row exists.
 *
 * Synthetic finishes (`live-std` / `live-ph`) select that Live key only —
 * used when TCGdex finishes cannot reach a dumped foil row.
 */
export function pickPaperVariant(
  entry: PaperCardEntry,
  finish: string | null | undefined,
): { key: "std" | "ph"; variant: PaperCardVariant } | null {
  const normalized = finish?.trim().toLowerCase() ?? "";
  if (!normalized || PLAIN_FINISHES.has(normalized)) return null;

  if (normalized === "live-std") {
    if (entry.std && isPaperFoilVariant(entry.std)) {
      return { key: "std", variant: entry.std };
    }
    return null;
  }
  if (normalized === "live-ph") {
    if (entry.ph && isPaperFoilVariant(entry.ph)) {
      return { key: "ph", variant: entry.ph };
    }
    return null;
  }

  if (normalized === "reverse") {
    if (entry.ph && isPaperFoilVariant(entry.ph)) {
      return { key: "ph", variant: entry.ph };
    }
    return null;
  }

  // holo / firstEdition / wPromo / unknown non-plain: prefer foil std, else ph
  if (isPaperFoilVariant(entry.std)) {
    return { key: "std", variant: entry.std! };
  }
  if (isPaperFoilVariant(entry.ph)) {
    return { key: "ph", variant: entry.ph! };
  }
  return null;
}

function resolutionFromVariant(
  bundle: string,
  key: "std" | "ph",
  variant: PaperCardVariant,
  source: PaperEffectResolution["source"] = "tcglive-bundle",
): PaperEffectResolution | null {
  const shader =
    foilManifestToShader(variant.shader) ||
    foilManifestToShader(variant.foil);
  if (!shader || shader === "NonFoil" || !paperMaterial(shader)) return null;
  return {
    shader,
    variant: key,
    confidence: "exact",
    source,
    maskTex: variant.maskTex?.trim() ? variant.maskTex : null,
    cardTex: variant.cardTex?.trim() ? variant.cardTex : null,
    etchTex: variant.etchTex?.trim() ? variant.etchTex : null,
    coldFoilTex: variant.coldFoilTex?.trim() ? variant.coldFoilTex : null,
    bundle,
  };
}

export function resolveEffectForPaperCard(signals: {
  bundleId?: string | null;
  setId?: string | null;
  number?: string | number | null;
  lang?: string | null;
  /** Prefer reverse / parallel (`ph`) when present. */
  preferParallel?: boolean;
}): PaperEffectResolution | null {
  const bundle =
    signals.bundleId?.trim() ||
    (signals.setId != null && signals.number != null
      ? paperBundleId(signals.setId, signals.number, signals.lang ?? "fr")
      : null);
  if (!bundle || !BUNDLE_RE.test(bundle)) return null;

  const entry = paperCard(bundle);
  if (!entry) return null;

  const preferPh = signals.preferParallel !== false;
  const variantKey: "ph" | "std" =
    preferPh && entry.ph ? "ph" : entry.std ? "std" : entry.ph ? "ph" : "std";
  const variant = entry[variantKey];
  if (!variant) return null;

  return resolutionFromVariant(bundle, variantKey, variant);
}

/**
 * Radiant Collection localIds (`RC1`) must try Live `*r` stems before the
 * main table — digit-stripping turns RC1 into `001`, which also exists on
 * the primary set and would otherwise steal the hit.
 */
export function orderLiveSetCandidates(
  candidates: readonly string[],
  collectorNumber: string,
): string[] {
  const wantsRadiant = /^rc\d/i.test(collectorNumber.trim());
  if (!wantsRadiant) return [...candidates];
  const radiant = candidates.filter((s) => /r$/i.test(s));
  const rest = candidates.filter((s) => !/r$/i.test(s));
  return [...radiant, ...rest];
}

/**
 * Catalogue printKey + finish → Live recipe. Exact dump hit only.
 * Tries primary Live candidates, then reprint fallbacks when the dedicated
 * stem is absent from the dump. Optional ``cardName`` uses the Live identity
 * sqlite as a last-resort join within those candidate sets.
 *
 * Bundle lang follows the caller, then `fr` / `en` (CDN scrape defaults).
 */
export function resolveEffectForPrintKey(
  printKey: string | null | undefined,
  finish: string | null | undefined,
  lang = "fr",
  cardName?: string | null,
): PaperEffectResolution | null {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== "pokemon") return null;

  const { primary, candidates: rawCandidates } = liveSetCandidatesForResolve(
    identity.set,
    dumpHasLiveStem,
  );
  const primarySet = new Set(primary);
  const candidates = orderLiveSetCandidates(rawCandidates, identity.number);

  const liveNumber = remapCollectorNumberForLive(
    identity.set,
    identity.number,
  );
  if (!liveNumber) return null;

  const langs = liveBundleLangsToTry(lang);

  for (const liveSet of candidates) {
    for (const tryLang of langs) {
      const bundle = paperBundleId(liveSet, liveNumber, tryLang);
      if (!bundle) continue;

      const entry = paperCard(bundle);
      if (!entry) continue;

      const picked = pickPaperVariant(entry, finish);
      if (!picked) continue;

      const source = primarySet.has(liveSet)
        ? "tcglive-bundle"
        : "tcglive-reprint-fallback";
      return resolutionFromVariant(
        bundle,
        picked.key,
        picked.variant,
        source,
      );
    }
  }

  // Sqlite set+num can recover when cards.json keying differs but identity
  // tables still know the printable card.
  for (const liveSet of candidates) {
    for (const tryLang of langs) {
      const hit = lookupBySetNum(liveSet, liveNumber, { lang: tryLang });
      if (!hit) continue;
      const entry = paperCard(hit.bundleStem);
      if (!entry) continue;
      const picked = pickPaperVariant(entry, finish);
      if (!picked) continue;
      const source = primarySet.has(liveSet)
        ? "tcglive-bundle"
        : "tcglive-reprint-fallback";
      return resolutionFromVariant(
        hit.bundleStem,
        picked.key,
        picked.variant,
        source,
      );
    }
  }

  const name = cardName?.trim();
  if (!name) return null;

  for (const tryLang of langs) {
    const hit = lookupByName(candidates, name, { lang: tryLang });
    if (!hit) continue;
    const entry = paperCard(hit.bundleStem);
    if (!entry) continue;
    const picked = pickPaperVariant(entry, finish);
    if (!picked) continue;
    return resolutionFromVariant(
      hit.bundleStem,
      picked.key,
      picked.variant,
      "tcglive-name-fallback",
    );
  }

  return null;
}

/** Public URL for a dumped mask texture under `/foil/pokemon`. */
export function paperMaskUrl(
  bundle: string,
  maskTex: string | null | undefined,
): string | null {
  const tex = maskTex?.trim();
  if (!tex) return null;
  return `/foil/pokemon/textures/${bundle}/${foilTextureFile(tex)}`;
}

/** Public URL for a dumped card art texture under `/foil/pokemon`. */
export function paperArtUrl(
  bundle: string,
  cardTex: string | null | undefined,
): string | null {
  const tex = cardTex?.trim();
  if (!tex) return null;
  return `/foil/pokemon/textures/${bundle}/${foilTextureFile(tex)}`;
}

/**
 * Locate the Live bundle for a catalogue print (no finish / foil required).
 * Same set+num → sqlite → name cascade as foil resolve.
 */
export function resolveLiveBundleForPrintKey(
  printKey: string | null | undefined,
  lang = "fr",
  cardName?: string | null,
): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity || identity.game !== "pokemon") return null;

  const { candidates: rawCandidates } = liveSetCandidatesForResolve(
    identity.set,
    dumpHasLiveStem,
  );
  const candidates = orderLiveSetCandidates(rawCandidates, identity.number);
  const liveNumber = remapCollectorNumberForLive(
    identity.set,
    identity.number,
  );
  if (!liveNumber) return null;

  const langs = liveBundleLangsToTry(lang);

  for (const liveSet of candidates) {
    for (const tryLang of langs) {
      const bundle = paperBundleId(liveSet, liveNumber, tryLang);
      if (!bundle) continue;
      if (paperCard(bundle)) return bundle;
    }
  }

  for (const liveSet of candidates) {
    for (const tryLang of langs) {
      const hit = lookupBySetNum(liveSet, liveNumber, { lang: tryLang });
      if (hit && paperCard(hit.bundleStem)) return hit.bundleStem;
    }
  }

  const name = cardName?.trim();
  if (!name) return null;
  for (const tryLang of langs) {
    const hit = lookupByName(candidates, name, { lang: tryLang });
    if (hit && paperCard(hit.bundleStem)) return hit.bundleStem;
  }
  return null;
}

export { liveSetCandidatesForResolve, liveSetCandidatesFromTcgdexSet, liveSetIdFromTcgdexSet };
