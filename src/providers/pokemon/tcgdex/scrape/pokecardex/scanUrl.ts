/**
 * PokéCardex scan CDN URLs (Bunny).
 *
 * Discovered 2026-09-18 from the React sets bundle:
 *   `https://pokecardex-scans.b-cdn.net/sets/{code}/{FR|US|DE}/{n}.jpg?class={original|hd|md}`
 * Card numbers are unpadded (`1`…`15`). `class=original` returns full JPEG.
 */

export const POKECARDEX_SCANS_ORIGIN = "https://pokecardex-scans.b-cdn.net";

export type PokecardexScanZone = "FR" | "US" | "DE";
export type PokecardexScanClass = "original" | "hd" | "md";

export function pokecardexScanUrl(opts: {
  seriesCode: string;
  zone: PokecardexScanZone;
  /** 1-based collector number (unpadded on CDN). */
  localId: number | string;
  imageClass?: PokecardexScanClass;
  origin?: string;
}): string {
  const code = opts.seriesCode.trim().toUpperCase();
  const n = String(opts.localId).trim().replace(/^0+/, "") || "0";
  const cls = opts.imageClass ?? "original";
  const origin = (opts.origin ?? POKECARDEX_SCANS_ORIGIN).replace(/\/$/, "");
  return `${origin}/sets/${code}/${opts.zone}/${n}.jpg?class=${cls}`;
}
