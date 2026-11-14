/**
 * PokéCardex scan CDN URLs (Bunny).
 *
 * Discovered 2026-09-18 from the React sets bundle:
 *   `https://pokecardex-scans.b-cdn.net/sets/{code}/{FR|US|DE}/{n}.jpg?class={original|hd|md}`
 * Card numbers are unpadded (`1`…`15`). `class=original` returns full JPEG.
 *
 * Black Star / era promos use collector ids like `SM01` / `XY12` in TCGdex;
 * PokéCardex files are still bare decimals (`1`, `12`).
 */

export const POKECARDEX_SCANS_ORIGIN = "https://pokecardex-scans.b-cdn.net";

export type PokecardexScanZone = "FR" | "US" | "DE";
export type PokecardexScanClass = "original" | "hd" | "md";

/**
 * TCGdex `local_id` → PokéCardex scan file stem (unpadded decimal).
 * `SM01` / `001` / `12` → `1` / `1` / `12`.
 */
export function pokecardexScanLocalId(localId: number | string): string {
  const raw = String(localId).trim();
  if (!raw) return "0";
  const promo = /^(?:SM|XY|BW|SWSH|SV|HGSS|DP|WP|HS|NP|RC|ME)0*(\d+)$/i.exec(
    raw,
  );
  if (promo) return promo[1] || "0";
  return raw.replace(/^0+/, "") || "0";
}

export function pokecardexScanUrl(opts: {
  seriesCode: string;
  zone: PokecardexScanZone;
  /** 1-based collector number (unpadded on CDN). */
  localId: number | string;
  imageClass?: PokecardexScanClass;
  origin?: string;
}): string {
  const code = opts.seriesCode.trim().toUpperCase();
  const n = pokecardexScanLocalId(opts.localId);
  const cls = opts.imageClass ?? "original";
  const origin = (opts.origin ?? POKECARDEX_SCANS_ORIGIN).replace(/\/$/, "");
  return `${origin}/sets/${code}/${opts.zone}/${n}.jpg?class=${cls}`;
}
