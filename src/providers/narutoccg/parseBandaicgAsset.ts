/**
 * Map Wayback / bandaicg.com EN CCG card image paths to print identity.
 * Pure — no I/O.
 *
 * Official tree: `naruto/images/cards_s{N}/{n|j|m|c|pr|ps}###[_t].jpg`
 * Promo folder: `cards_pr/`.
 * Set codes: `s1`…`s28`, `promo` — same series tree as FR/JP; locale = `en`
 * under `cards/{set}/en/…`. Dump target today: `staging/bandaicg-en/`.
 */

import { buildPrintKey } from "@/core/identify/printKey";

import { NARUTO_GAME, narutoSetCode } from "./parseCarddassAsset";

export type ParsedBandaicgAsset = {
  /** Set code: `s1`… or `promo` */
  set: string;
  /** Letter prefix as on file: `n`, `j`, `m`, `c`, `pr`, `ps`, … */
  cardType: string;
  /** Full collector id: `n001`, `pr018b` */
  number: string;
  role: "art" | "thumb";
  printKey: string;
  cardId: string;
};

/** @deprecated Prefer {@link narutoSetCode} — EN no longer uses an `en.` prefix. */
export function enSetCode(series: string): string {
  return narutoSetCode(series);
}

/**
 * Parse a bandaicg.com card image URL or pathname.
 * Returns null for chrome / unrecognised files.
 */
export function parseBandaicgAssetPath(
  urlOrPath: string,
): ParsedBandaicgAsset | null {
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
    /\/naruto\/images\/(cards_(?:pr|s\d+))\/([^/]+\.(?:jpe?g|png|gif|webp))$/i,
  );
  if (!m) return null;

  const folder = m[1]!.toLowerCase();
  const filename = m[2]!;
  let series: string;
  if (folder === "cards_pr") {
    series = "promo";
  } else {
    const sm = folder.match(/^cards_s(\d+)$/);
    if (!sm) return null;
    series = `s${sm[1]}`;
  }
  const set = narutoSetCode(series);

  const base = filename.replace(/\.(jpe?g|png|gif|webp)$/i, "");
  const thumb = /_t$/i.test(base);
  const stem = base.replace(/_t$/i, "").toLowerCase();

  // n001 | j042 | m005 | c012 | pr018b | ps004
  const parts = stem.match(/^([a-z]+)(\d+[a-z]*)$/i);
  if (!parts) return null;
  const cardType = parts[1]!.toLowerCase();
  const number = `${cardType}${parts[2]!.toLowerCase()}`;

  const printKey = buildPrintKey({
    game: NARUTO_GAME,
    set,
    number,
    grouping: null,
  });
  if (!printKey) return null;

  return {
    set,
    cardType,
    number,
    role: thumb ? "thumb" : "art",
    printKey,
    cardId: number,
  };
}

/** Collector type from on-disk card id (`ni023` → `ni`, `n001` → `n`, `pr002` → `pr`). */
export function cardTypeFromCollectorNumber(number: string): string {
  const m = number
    .trim()
    .toLowerCase()
    .match(/^([a-z]+)/);
  return m?.[1] ?? number.slice(0, 2).toLowerCase();
}
