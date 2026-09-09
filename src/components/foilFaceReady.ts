/**
 * Whether a foil (or plain) card face may paint over the parent card-back
 * skeleton. Art must be decoded; when a CSS foil recipe is intended, every
 * mask URL we will wear must already be a blob in memory — otherwise layers
 * pop in one by one.
 */
export function foilFaceReady(input: {
  artReady: boolean;
  wantsFoil: boolean;
  maskUrl?: string | null;
  foilMask: string | null;
  varnishMaskUrl?: string | null;
  varnishMask: string | null;
  secondVarnishMaskUrl?: string | null;
  secondVarnishMask: string | null;
}): boolean {
  if (!input.artReady) return false;
  if (!input.wantsFoil) return true;
  return (
    (!input.maskUrl || Boolean(input.foilMask)) &&
    (!input.varnishMaskUrl || Boolean(input.varnishMask)) &&
    (!input.secondVarnishMaskUrl || Boolean(input.secondVarnishMask))
  );
}

/**
 * CSS idle lean gate. Ultra Gold / Scodix / SwSecret are **full-card** (no WP
 * shine mask); requiring `shineMask` left them frozen after pointer leave —
 * idle never armed, last pose stuck.
 */
export function holoCssIdleEnabled(input: {
  hasFinish: boolean;
  isDriven: boolean;
  /** Live gold / secret: paint full-card without a white-plate shine mask. */
  fullCardFinish: boolean;
  shineMask: string | null;
}): boolean {
  if (!input.hasFinish || input.isDriven) return false;
  if (input.fullCardFinish) return true;
  return Boolean(input.shineMask);
}

/**
 * Whether the WebGL path has the surfaces it cannot invent. Etch / cold-foil
 * plates are optional — the renderer falls back to solid black ("no plate").
 * Only the foil mask is required when the material samples it.
 */
export function foilSurfacesReady(input: {
  hasMaterial: boolean;
  needsFoilMask: boolean;
  foilMaskUrl?: string | null;
}): boolean {
  if (!input.hasMaterial) return false;
  if (input.needsFoilMask && !input.foilMaskUrl) return false;
  return true;
}

/**
 * Whether a look must be suppressed for want of the mask it samples.
 *
 * The twin of {@link foilSurfacesReady}, for the CSS path. WebGL already
 * refused a material whose foil mask is missing; CSS never looked, so it
 * spread the finish across the whole card instead of the foiled zones only.
 *
 * A print without a mask is not a print without zones — it is a print whose
 * zones are unknown. Flat is the honest rendering; a misplaced foil is not.
 */
export function foilLookSuppressed(input: {
  hasMaterial: boolean;
  needsFoilMask: boolean;
  foilMaskUrl?: string | null;
}): boolean {
  if (!input.hasMaterial) return false;
  return input.needsFoilMask && !input.foilMaskUrl;
}
