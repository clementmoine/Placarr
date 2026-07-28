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
  "silver",
  "lore",
  "rainbow",
  "aurora",
  "sheen",
  "sparkle",
  "gloss",
  "hotFoil",
] as const;

export type HoloShaderId = (typeof HOLO_SHADER_IDS)[number];

/**
 * Brushed metal: the everyday foil, and the fallback for anything unknown.
 *
 * Achromatic on purpose. This started life as a rainbow, which was simply the
 * wrong reading of the word — the publisher calls the finish *Silver*, and
 * silver is not a spectrum. Colour here made every common card look like the
 * rarest ones.
 *
 * Narrow bright streaks separated by black, because `color-dodge` leaves black
 * untouched: the lit parts read as reflections catching an edge rather than as
 * a wash lying over the whole card. Metal does not glow evenly.
 *
 * And it rests dark. Unlit silver is nearly the plain card; the light arrives
 * with the pointer, which is why its two states are further apart than any
 * other look here.
 */
const SILVER: HoloShader = {
  id: "silver",
  sweep:
    "repeating-linear-gradient(105deg, #000000 0%, #4a4a4a 2.5%, #f2f2f2 4.5%, #8a8a8a 6.5%, #000000 10%)",
  sweepScale: "230% 230%",
  sweepFilter: "brightness(0.72) contrast(1.5)",
  sweepOpacity: { idle: 0.22, active: 0.85 },
  grainOpacity: { idle: 0.3, active: 0.75 },
  grainScale: "150px 150px",
};

/** An actual spectrum, for the finishes that really are one. */
const RAINBOW: HoloShader = {
  id: "rainbow",
  sweep:
    "repeating-linear-gradient(115deg, #ff6b8b 0%, #ffe066 12%, #6bffb8 24%, #6bd5ff 36%, #b98bff 48%, #ff6b8b 60%)",
  sweepScale: "300% 300%",
  sweepFilter: "brightness(0.55) contrast(2.2) saturate(1.5)",
  sweepOpacity: { idle: 0.34, active: 0.75 },
  grainOpacity: { idle: 0.45, active: 0.9 },
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
  sweepOpacity: { idle: 0.5, active: 0.85 },
  grainOpacity: { idle: 0.35, active: 0.8 },
  grainScale: "190px 190px",
};

/**
 * The showpiece look, for the tier a game prints ten of.
 *
 * Loud at rest, and that is the point. `silver` rests dark because unlit metal
 * *is* dark, and that reasoning does not carry: it was generalised to every
 * look here and left an Iconique card — one of ten in 3154 prints — rendering
 * fainter than a common. A card someone opened a case to find has to announce
 * itself sitting still.
 */
const LORE: HoloShader = {
  id: "lore",
  sweep:
    "repeating-linear-gradient(108deg, #2b1f00 0%, #ffdf7a 3%, #ffffff 5%, #ffc4e8 7%, #7ad4ff 9%, #2b1f00 13%)",
  sweepScale: "250% 250%",
  sweepFilter: "brightness(0.68) contrast(2) saturate(1.4)",
  sweepOpacity: { idle: 0.6, active: 0.95 },
  grainOpacity: { idle: 0.65, active: 1 },
  grainScale: "130px 130px",
};

/** One soft warm highlight, no spectrum: a smooth finish, not a diffracting one. */
const SHEEN: HoloShader = {
  id: "sheen",
  sweep:
    "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.75) 45%, rgba(255,236,180,0.9) 50%, rgba(255,255,255,0.75) 55%, transparent 80%)",
  sweepScale: "200% 200%",
  sweepFilter: "brightness(0.7) contrast(1.6)",
  sweepOpacity: { idle: 0.42, active: 0.7 },
  grainOpacity: { idle: 0.3, active: 0.5 },
  grainScale: "150px 150px",
};

/** Mostly tooth: the light comes from the facets, not from a travelling band. */
const SPARKLE: HoloShader = {
  id: "sparkle",
  sweep:
    "repeating-linear-gradient(100deg, #fff6d5 0%, #ffffff 20%, #ffe9f5 40%, #ffffff 60%, #fff6d5 80%)",
  sweepScale: "220% 220%",
  sweepFilter: "brightness(0.45) contrast(1.9)",
  sweepOpacity: { idle: 0.35, active: 0.65 },
  grainOpacity: { idle: 0.8, active: 1 },
  grainScale: "110px 110px",
};

/**
 * A clear coat catching the light. The restrained one — it sits over whatever
 * the foil is doing and must not compete with it.
 */
const GLOSS: HoloShader = {
  id: "gloss",
  sweep:
    "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.75) 45%, rgba(255,236,180,0.9) 50%, rgba(255,255,255,0.75) 55%, transparent 80%)",
  sweepScale: "200% 200%",
  sweepFilter: "brightness(0.7) contrast(1.6)",
  sweepOpacity: { idle: 0.3, active: 0.45 },
  grainOpacity: { idle: 0.12, active: 0.2 },
  grainScale: "150px 150px",
};

/**
 * Dichroic hot foil: the stamped line work, not a coat over the whole card.
 *
 * Two hues and nothing between them. Watching the publisher's app tilt one of
 * these, the castle outline, the swirls and the ability headers swing between
 * an electric cyan and a red-magenta — that is what a dichroic film does, it
 * reflects one colour and transmits its complement. A spectrum would be wrong
 * here, and so would a white sheen.
 *
 * Loud, because on the cards that carry it this *is* the effect: it is stamped
 * onto the art's own lines, and the mask is that line work.
 */
const HOT_FOIL: HoloShader = {
  id: "hotFoil",
  sweep:
    "repeating-linear-gradient(112deg, #00121b 0%, #24f0ff 4%, #071d2a 8%, #ff2f8a 12%, #00121b 16%)",
  sweepScale: "240% 240%",
  sweepFilter: "brightness(0.78) contrast(1.9) saturate(1.7)",
  sweepOpacity: { idle: 0.7, active: 1 },
  grainOpacity: { idle: 0.2, active: 0.35 },
  grainScale: "120px 120px",
};

const SHADERS: Readonly<Record<HoloShaderId, HoloShader>> = {
  silver: SILVER,
  lore: LORE,
  rainbow: RAINBOW,
  aurora: AURORA,
  sheen: SHEEN,
  sparkle: SPARKLE,
  gloss: GLOSS,
  hotFoil: HOT_FOIL,
};

/**
 * The one look allowed to be nearly invisible at rest, because unlit metal is.
 * Every other finish marks a card as rarer than plain, so it has to say so
 * without being touched — see the floor this is excepted from in the tests.
 */
export const RESTS_DARK_SHADER_ID: HoloShaderId = "silver";

/** What an unrecognized or missing look falls back to. */
export const DEFAULT_HOLO_SHADER_ID: HoloShaderId = "silver";

/**
 * What a varnish falls back to. Its own default, because the two axes are not
 * interchangeable: an unknown *coat* should stay out of the way, where an
 * unknown *foil* should still look like foil.
 */
export const DEFAULT_VARNISH_SHADER_ID: HoloShaderId = "gloss";

/** The look for a varnish id, or a plain clear coat. */
export function varnishShader(id: string | null | undefined): HoloShader {
  return isHoloShaderId(id) ? SHADERS[id] : SHADERS[DEFAULT_VARNISH_SHADER_ID];
}

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
