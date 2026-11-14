/**
 * Data Carddass sleeve backs — numbered CODE128 motif, one scan per era when
 * we lack per-print versos. Flip falls through to pack default otherwise.
 */
import { assetsSetBackRoleUrl } from "@/lib/packAssetUrls";

/**
 * Pack id only — keep this module free of `node:*` so effect packs stay
 * client-safe (`listEffectPacks` → FoilPlayroom).
 * Mirror of `NARUTO_DATA_CARDDASS_PACK_ID` in `./pack`.
 */
const DATA_CARDDASS_PACK_ID = "naruto/data-carddass";

/** Set codes that share a curated numbered sleeve on disk. */
const SET_SLEEVE_ALIASES: Readonly<Record<string, string>> = {
  dn: "dn",
  /** Same cabinet family until we curate a distinct DT verso. */
  dt: "dn",
  nm: "nm",
};

/**
 * Map printKey / setCode → curated set folder that has `back.webp` installed.
 */
export function dataCarddassBackSetFromPrint(
  opts: { setCode?: string | null; printKey?: string | null },
): string | null {
  const fromSet = opts.setCode?.trim().toLowerCase();
  if (fromSet && SET_SLEEVE_ALIASES[fromSet]) {
    return SET_SLEEVE_ALIASES[fromSet]!;
  }
  const key = opts.printKey?.trim().toLowerCase() ?? "";
  if (!key.startsWith("datacarddass:")) return null;
  const body = key.slice("datacarddass:".length);
  const set = body.split("-")[0]?.trim() ?? "";
  return SET_SLEEVE_ALIASES[set] ?? null;
}

/**
 * Role URL for a set sleeve (`cards/ja/{set}/back.ja.*` after curated install).
 * Null → caller falls through to pack `cardBackUrl`.
 */
export function resolveDataCarddassCardBack(opts: {
  setCode?: string | null;
  printKey?: string | null;
}): string | null {
  const set = dataCarddassBackSetFromPrint(opts);
  if (!set) return null;
  return assetsSetBackRoleUrl(DATA_CARDDASS_PACK_ID, set, "ja");
}
