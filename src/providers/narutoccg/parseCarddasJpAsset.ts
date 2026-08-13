/**
 * Map Wayback / carddas.com JP card specials (sparse official archive).
 * Pure — no I/O.
 *
 * Official CDX only retained a handful of `cardlist/card_img/*_spc2.gif`
 * (not a full 巻ノ… face dump). Identity uses set `spc`; locale `jap` under
 * `cards/spc/jap/…` when promoted. Dump target today: `staging/carddas-jp/`.
 */

import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_GAME, narutoSetCode } from "./parseCarddassAsset";

export const NARUTO_JP_SPC_SET = narutoSetCode("spc");

export type ParsedCarddasJpAsset = {
  set: string;
  /** Coarse type from filename prefix when present */
  kind: "jutsu" | "irai" | "saku" | "other";
  /** Filename stem, e.g. `jutsu-027_spc2` */
  stem: string;
  /** Alphanumeric collector id for disk + printKey */
  number: string;
  cardId: string;
  printKey: string;
  /** Extension including dot */
  ext: string;
};

/**
 * Parse a carddas.com JP card_img URL.
 * Returns null for chrome (`head.gif`) or unrecognised paths.
 */
export function parseCarddasJpAssetPath(
  urlOrPath: string,
): ParsedCarddasJpAsset | null {
  let pathname: string;
  try {
    pathname = urlOrPath.includes("://")
      ? new URL(urlOrPath).pathname
      : urlOrPath;
  } catch {
    pathname = urlOrPath;
  }
  pathname = decodeURIComponent(pathname).replace(/\\/g, "/");

  const m = pathname.match(
    /\/naruto\/cardlist\/card_img\/([^/]+\.(?:jpe?g|png|gif|webp))$/i,
  );
  if (!m) return null;

  const filename = m[1]!;
  const extMatch = filename.match(/(\.[a-z0-9]+)$/i);
  const ext = (extMatch?.[1] ?? ".gif").toLowerCase();
  const stem = filename.replace(/\.(jpe?g|png|gif|webp)$/i, "").toLowerCase();
  if (stem === "head" || stem.startsWith("head")) return null;

  let kind: ParsedCarddasJpAsset["kind"] = "other";
  if (stem.startsWith("jutsu")) kind = "jutsu";
  else if (stem.startsWith("irai")) kind = "irai";
  else if (stem.startsWith("saku")) kind = "saku";

  // printKey segment: alnum only (drop hyphens / underscores)
  const number = stem.replace(/[^a-z0-9]/gi, "");
  if (!number) return null;

  const printKey = buildPrintKey({
    game: NARUTO_GAME,
    set: NARUTO_JP_SPC_SET,
    number,
    grouping: null,
  });
  if (!printKey) return null;

  return {
    set: NARUTO_JP_SPC_SET,
    kind,
    stem,
    number,
    cardId: number,
    printKey,
    ext,
  };
}
