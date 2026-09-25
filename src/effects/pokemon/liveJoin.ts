/**
 * Shared TCGdex ↔ Live bridge for foil resolve.
 *
 * Live sqlite confirms / recovers bundles; cards.json remains the shader source.
 * Also carries collector remaps, reprint meta, owned-playroom lists, and
 * catalogue face-orientation signals used when presenting joined prints.
 */
import { loadLiveOwned, loadReprintMeta } from "@/lib/foilMetaLoad";
import type { FaceQuarterTurns } from "@/lib/text/cardFormat";

import type { PokemonPaperFoilName } from "./foilNames";
import type { LiveCardRow } from "./liveCardsLookups";
import { lookupByBundle } from "./liveCardsLookups";
import {
  resolveEffectForPrintKey,
  type PaperEffectResolution,
} from "./resolveEffect";

// ── Join Live for print ─────────────────────────────────────────────────────

export type LiveJoinResult = {
  resolution: PaperEffectResolution;
  /** Identity row when sqlite is present (bundle preferred). */
  liveRow: LiveCardRow | null;
};

/**
 * Resolve foil for a catalogue print and attach Live identity when available.
 */
export function joinLiveForPrint(input: {
  printKey: string | null | undefined;
  finish: string | null | undefined;
  lang?: string | null;
  name?: string | null;
}): LiveJoinResult | null {
  const resolution = resolveEffectForPrintKey(
    input.printKey,
    input.finish,
    input.lang ?? "fr",
    input.name,
  );
  if (!resolution) return null;
  const liveRow = lookupByBundle(resolution.bundle);
  return { resolution, liveRow };
}

// ── Face orientation (BREAK / TURBO) ────────────────────────────────────────

/**
 * Pokémon prints that share the standard TCG rectangle but sit on their side
 * (XY BREAK / TURBO). Catalogue signals — not pixel dimensions (assets stay
 * portrait files with sideways content).
 */
export function faceQuarterTurnsForPokemonPrint(signals: {
  stage?: string | null;
  rarityCode?: string | null;
}): FaceQuarterTurns {
  if (signals.rarityCode === "BreakRare") return 1;
  const stage = signals.stage?.trim().toUpperCase() ?? "";
  if (stage === "BREAK" || stage === "TURBO") return 1;
  return 0;
}

// ── Reprint meta (Shiny Vault splits) ───────────────────────────────────────

/**
 * Generated reprint hints for TCGdex Shiny Vault splits (`*sv`).
 * @see data/pokemon/reprintMeta.json — regenerate via audit-map `--write-reprint-meta`.
 */

export type ReprintMetaEntry = {
  parentTcgdex: string;
  parentLive: string;
  /** Live num = svOffset + SV# (SV001 → offset+1). */
  svOffset: number;
  parentCardTotal: number;
  vaultCardTotal: number;
};

export type ReprintMetaFile = {
  generatedAt: string;
  source: string;
  byTcgdexSet: Record<string, ReprintMetaEntry>;
};

function meta(): ReprintMetaFile {
  const raw = loadReprintMeta() as Partial<ReprintMetaFile>;
  return {
    generatedAt: raw.generatedAt ?? "",
    source: raw.source ?? "",
    byTcgdexSet: raw.byTcgdexSet ?? {},
  };
}

export function reprintMetaForTcgdexSet(
  setId: string | null | undefined,
): ReprintMetaEntry | null {
  const raw = setId?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  return meta().byTcgdexSet[raw] ?? null;
}

export function listReprintMetaSets(): string[] {
  return Object.keys(meta().byTcgdexSet).sort();
}

// ── Collector-number remaps ─────────────────────────────────────────────────

/**
 * Collector-number remaps when TCGdex localIds do not match Live CDN nums
 * on the shared stem (Shiny Vault inside Hidden Fates, etc.).
 */

/** Live sm11-5 packs HF main (1–68) then Shiny Vault at 70–163 (= 69 + SV#). */
export const SM115_SHINY_VAULT_LIVE_OFFSET = 69;

/**
 * TCGdex `30th-c` / local `me05.5c` assigns a fake 001–030 order that does
 * **not** match TCG Live `me5-5c` (release order: Pikachu #1, Charizard #2…).
 * Joining by collector number alone put Dracaufeu's name on Pikachu's face.
 * Built by matching EN names TCGdex ↔ Live (2026-09-20).
 */
export const ME05_5C_TCGDEX_TO_LIVE: Readonly<Record<string, string>> = {
  "1": "2",
  "2": "8",
  "3": "11",
  "4": "20",
  "5": "3",
  "6": "9",
  "7": "5",
  "8": "25",
  "9": "22",
  "10": "13",
  "11": "14",
  "12": "27",
  "13": "24",
  "14": "1",
  "15": "4",
  "16": "19",
  "17": "23",
  "18": "15",
  "19": "16",
  "20": "17",
  "21": "18",
  "22": "12",
  "23": "21",
  "24": "6",
  "25": "10",
  "26": "28",
  "27": "29",
  "28": "26",
  "29": "7",
  "30": "30",
};

const ME05_5C_SET_IDS = new Set(["me05.5c", "30th-c"]);

/**
 * Map a TCGdex collector number onto the Live table number for a given set.
 * Returns the original string when no remap applies (caller still digit-strips).
 */
export function remapCollectorNumberForLive(
  tcgdexSetId: string | null | undefined,
  collectorNumber: string | number | null | undefined,
): string | null {
  if (collectorNumber == null) return null;
  const set = tcgdexSetId?.trim().toLowerCase() ?? "";
  const raw = String(collectorNumber).trim();
  if (!raw) return null;

  if (ME05_5C_SET_IDS.has(set) && /^\d+$/.test(raw)) {
    const live = ME05_5C_TCGDEX_TO_LIVE[String(Number.parseInt(raw, 10))];
    if (live) return live;
  }

  if (set === "sma") {
    const shiny = /^sv(\d+)$/i.exec(raw);
    if (shiny) {
      const sv = Number.parseInt(shiny[1]!, 10);
      if (sv >= 1) return String(SM115_SHINY_VAULT_LIVE_OFFSET + sv);
    }
  }

  // Auto: TCGdex `*sv` vault splits → offset from generated reprintMeta.json
  const reprint = reprintMetaForTcgdexSet(set);
  if (reprint) {
    const shiny = /^sv(\d+)$/i.exec(raw);
    if (shiny) {
      const sv = Number.parseInt(shiny[1]!, 10);
      if (sv >= 1) return String(reprint.svOffset + sv);
    }
  }

  return raw;
}

// ── Owned Live bundles (playroom) ───────────────────────────────────────────

/**
 * Preferred Live prints confirmed owned in TCG Live.
 *
 * Ownership is server-side. Source: Rainier carddex → `data/pokemon/liveOwned.json`.
 */

export type LiveOwnedFile = {
  updatedAt?: string;
  source?: string;
  notes?: string;
  byEffect?: Partial<Record<string, string[]>>;
};

function ownedFile(): LiveOwnedFile {
  return loadLiveOwned() as LiveOwnedFile;
}

/** Bundle stems listed as owned for this Live foil leaf (may be empty). */
export function ownedBundlesForShader(
  shader: PokemonPaperFoilName | string,
): string[] {
  const raw = ownedFile().byEffect?.[shader];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const stem = typeof id === "string" ? id.trim() : "";
    if (!stem || seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

/** True when this bundle is listed under any effect (or the given one). */
export function isOwnedPlayroomBundle(
  bundleId: string,
  shader?: PokemonPaperFoilName | string,
): boolean {
  const id = bundleId.trim();
  if (!id) return false;
  if (shader) return ownedBundlesForShader(shader).includes(id);
  const by = ownedFile().byEffect ?? {};
  for (const list of Object.values(by)) {
    if (Array.isArray(list) && list.includes(id)) return true;
  }
  return false;
}
