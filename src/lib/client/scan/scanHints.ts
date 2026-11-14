import type { QualityHint } from "@/lib/client/scan/qualityGates";

export type ScanHintMode = "auto" | "barcode" | "card";
export type ScanHintPhase = "looking" | "understanding" | "delivering";

/**
 * Overlay copy for the live scanner. Pure — unit-tested so Auto never shows
 * card-miss framing advice while hunting a barcode.
 */
export function scanOverlayHint(
  t: (key: string) => string,
  hint: QualityHint,
  phase: ScanHintPhase,
  mode: ScanHintMode,
  identifyMiss?: boolean,
  hasMatches?: boolean,
): string {
  if (phase === "delivering") return t("scanner.phaseDelivering");
  if (phase === "understanding") {
    return hasMatches ? "" : t("scanner.phaseUnderstanding");
  }
  // identifyMiss is only set after a card identify attempt returned empty —
  // show it in Auto too, otherwise a miss looks like "still aiming".
  if (identifyMiss && hint === "ok" && (mode === "card" || mode === "auto")) {
    return t("scanner.hintNoMatch");
  }
  switch (hint) {
    case "too_far":
      return t("scanner.hintTooFar");
    case "too_small":
      return t("scanner.hintTooFar");
    case "blurry":
    case "hold_still":
      return t("scanner.hintHoldStill");
    case "too_dark":
      return t("scanner.hintTooDark");
    case "too_bright":
      return t("scanner.hintTooBright");
    case "glare":
      return t("scanner.hintGlare");
    case "card_back":
      return t("scanner.hintCardBack");
    case "empty":
      return t("scanner.hintEmpty");
    default:
      if (mode === "barcode") return t("scanner.description");
      if (mode === "card") return t("scanner.cardLiveHint");
      return t("scanner.autoHint");
  }
}
