import type { FoilBackend, FoilBackendPreference } from "./types";

export function selectFoilBackend(opts: {
  preference: FoilBackendPreference;
  supportsWebgl2: boolean;
  hasMaterial: boolean;
  hasPoolSlot: boolean;
}): FoilBackend {
  const { preference, supportsWebgl2, hasMaterial, hasPoolSlot } = opts;

  if (preference === "css") return "css";

  const webglReady = supportsWebgl2 && hasMaterial && hasPoolSlot;
  if (preference === "webgl" || preference === "auto") {
    return webglReady ? "webgl" : "css";
  }

  return "css";
}
