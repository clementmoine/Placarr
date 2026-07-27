/**
 * The looks a foil printing can be drawn with.
 *
 * Publishers name their finishes — Ravensburger alone ships eleven, from the
 * `Silver` on nearly every common to the `Lava` that only Enchanted cards get —
 * and those names are the library. Each one is a set of numbers here; deciding
 * which name maps to which look belongs to the provider that knows the names,
 * never to this file.
 *
 * Every field feeds CSS directly. They are deliberately plain values rather
 * than class names: an inline style is the only thing that reliably beats both
 * the idle keyframes and the utility classes, which this component has been
 * bitten by twice.
 */
export type HoloShader = {
  id: HoloShaderId;
  /** The sweep's `background-image`. */
  sweep: string;
  /** Its `background-size`. How wide the bands read. */
  sweepScale: string;
  /**
   * Applied before the sweep is dodged onto the artwork. Straight from a
   * gradient, `color-dodge` blows every light area to flat white and the colour
   * disappears, so each look darkens itself first.
   */
  sweepFilter: string;
  /** Sweep strength at rest and under the pointer. Never zero at rest: the
   * point is that a foil copy reads as special before anyone touches it. */
  sweepOpacity: Readonly<{ idle: number; active: number }>;
  /** Facet strength, same two states. Zero for a finish with no visible tooth. */
  grainOpacity: Readonly<{ idle: number; active: number }>;
  /** Facet tile size. Smaller is finer. */
  grainScale: string;
};

export const HOLO_SHADER_IDS = [
  "rainbowBands",
  "aurora",
  "sheen",
  "sparkle",
] as const;

export type HoloShaderId = (typeof HOLO_SHADER_IDS)[number];

/** Tight repeating spectrum: the everyday foil, and the fallback for anything unknown. */
const RAINBOW_BANDS: HoloShader = {
  id: "rainbowBands",
  sweep:
    "repeating-linear-gradient(115deg, #ff6b8b 0%, #ffe066 12%, #6bffb8 24%, #6bd5ff 36%, #b98bff 48%, #ff6b8b 60%)",
  sweepScale: "300% 300%",
  sweepFilter: "brightness(0.55) contrast(2.2) saturate(1.5)",
  sweepOpacity: { idle: 0.5, active: 0.65 },
  grainOpacity: { idle: 0.7, active: 0.9 },
  grainScale: "160px 160px",
};

/**
 * Broad pastel wash rather than bands — the look the top rarities get.
 *
 * Measured off a recording of the publisher's own app: between two frames the
 * card's right half moved by 30–88 per channel while the left barely shifted,
 * and the movement was chromatic, not a change in brightness (one block went
 * -52 red, -69 green, but only -15 blue). That is one wide soft band travelling
 * across and changing hue, so the stops are few, far apart and desaturated,
 * where the everyday foil repeats a tight spectrum.
 */
const AURORA: HoloShader = {
  id: "aurora",
  sweep:
    "linear-gradient(125deg, #ffd9ec 0%, #cbb2ff 18%, #9fe8ff 36%, #d8ffe6 52%, #fff0b8 68%, #ffc2dd 84%, #b8c6ff 100%)",
  // Far wider than the banded look: one pass of the gradient covers the card,
  // so what crosses it is a single light rather than a stack of stripes.
  sweepScale: "260% 260%",
  sweepFilter: "brightness(0.62) contrast(1.7) saturate(1.35)",
  sweepOpacity: { idle: 0.62, active: 0.8 },
  grainOpacity: { idle: 0.55, active: 0.75 },
  grainScale: "190px 190px",
};

/** One soft warm highlight, no spectrum: a smooth finish, not a diffracting one. */
const SHEEN: HoloShader = {
  id: "sheen",
  sweep:
    "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.75) 45%, rgba(255,236,180,0.9) 50%, rgba(255,255,255,0.75) 55%, transparent 80%)",
  sweepScale: "200% 200%",
  sweepFilter: "brightness(0.7) contrast(1.6)",
  sweepOpacity: { idle: 0.25, active: 0.4 },
  grainOpacity: { idle: 0.2, active: 0.35 },
  grainScale: "150px 150px",
};

/** Mostly tooth: the light comes from the facets, not from a travelling band. */
const SPARKLE: HoloShader = {
  id: "sparkle",
  sweep:
    "repeating-linear-gradient(100deg, #fff6d5 0%, #ffffff 20%, #ffe9f5 40%, #ffffff 60%, #fff6d5 80%)",
  sweepScale: "220% 220%",
  sweepFilter: "brightness(0.45) contrast(1.9)",
  sweepOpacity: { idle: 0.3, active: 0.45 },
  grainOpacity: { idle: 0.95, active: 1 },
  grainScale: "110px 110px",
};

const SHADERS: Readonly<Record<HoloShaderId, HoloShader>> = {
  rainbowBands: RAINBOW_BANDS,
  aurora: AURORA,
  sheen: SHEEN,
  sparkle: SPARKLE,
};

/** What an unrecognized or missing look falls back to. */
export const DEFAULT_HOLO_SHADER_ID: HoloShaderId = "rainbowBands";

export function isHoloShaderId(value: unknown): value is HoloShaderId {
  return (
    typeof value === "string" &&
    (HOLO_SHADER_IDS as readonly string[]).includes(value)
  );
}

/**
 * The look for an id, or the everyday foil.
 *
 * Never throws and never returns nothing: a finish this build has no look for
 * still has to render as *some* foil, because the copy really is one.
 */
export function holoShader(id: string | null | undefined): HoloShader {
  return isHoloShaderId(id) ? SHADERS[id] : SHADERS[DEFAULT_HOLO_SHADER_ID];
}
