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
