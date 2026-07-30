import type { HoloShader } from "@/core/render/holoShaders";

/**
 * The looks this project drew before the publisher's own were transcribed.
 *
 * Ours, entirely: four CSS gradients and a turbulence grain, no external
 * texture. They were replaced in `b3e104b0` — not because they were bad, but
 * because every finish rendered identically through them, so an Enchanted print
 * and a common silver one were indistinguishable. Publisher recipes solved the
 * *distinctness* problem; these still have a character worth keeping in view.
 *
 * `aurora` is the one with real evidence behind it: its stops were measured off
 * a recording of the publisher's app, where between two frames the card's right
 * half moved 30–88 per channel while the left barely shifted, and the movement
 * was chromatic rather than a brightness change. That is one wide soft band
 * travelling and changing hue — hence stops that are few, far apart and
 * desaturated, where the everyday foil repeats a tight spectrum.
 *
 * Converted to the current shape: the old renderer dodged the sweep and the
 * grain onto the artwork as two masked layers with their own filters, which
 * this shape has no room for. They are folded into one layer here, the grain
 * screened over the sweep. Close in character, not byte-identical to what
 * shipped then — nothing pins these, so nothing pretends otherwise.
 */

/** Fractal noise as facets. Inline so a look needs no asset to exist. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E\")";

export const HOUSE_HOLO_SHADER_IDS = [
  "rainbowBands",
  "aurora",
  "sheen",
  "sparkle",
] as const;

export type HouseHoloShaderId = (typeof HOUSE_HOLO_SHADER_IDS)[number];

const HOUSE_SHADERS: Readonly<Record<HouseHoloShaderId, HoloShader>> = {
  /** Tight repeating spectrum: what every foil used to look like. */
  rainbowBands: {
    id: "silver",
    backgroundImage: `repeating-linear-gradient(115deg, #ff6b8b 0%, #ffe066 12%, #6bffb8 24%, #6bd5ff 36%, #b98bff 48%, #ff6b8b 60%), ${GRAIN}`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "300% 300%, 160px 160px",
    backgroundPosition: "var(--combined) center, center",
    backgroundBlendMode: "screen",
    mixBlendMode: "color-dodge",
    opacity: 0.5,
    // Straight from a gradient, `color-dodge` blows every light area to flat
    // white and the colour disappears, so the look darkens itself first.
    filter: "brightness(0.55) contrast(2.2) saturate(1.5)",
  },

  /** One wide pastel band travelling and changing hue — see the file header. */
  aurora: {
    id: "silver",
    backgroundImage: `linear-gradient(125deg, #ffd9ec 0%, #cbb2ff 18%, #9fe8ff 36%, #d8ffe6 52%, #fff0b8 68%, #ffc2dd 84%, #b8c6ff 100%), ${GRAIN}`,
    backgroundRepeat: "no-repeat, repeat",
    // Wider than the banded look on purpose: one pass covers the card, so what
    // crosses it is a single light rather than a stack of stripes.
    backgroundSize: "260% 260%, 190px 190px",
    backgroundPosition: "var(--combined) center, center",
    backgroundBlendMode: "screen",
    mixBlendMode: "color-dodge",
    opacity: 0.62,
    filter: "brightness(0.62) contrast(1.7) saturate(1.35)",
  },

  /** One soft warm highlight, no spectrum: smooth, not diffracting. */
  sheen: {
    id: "silver",
    backgroundImage: `linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.75) 45%, rgba(255,236,180,0.9) 50%, rgba(255,255,255,0.75) 55%, transparent 80%), ${GRAIN}`,
    backgroundRepeat: "no-repeat, repeat",
    backgroundSize: "200% 200%, 150px 150px",
    backgroundPosition: "var(--combined) center, center",
    backgroundBlendMode: "screen",
    mixBlendMode: "color-dodge",
    opacity: 0.25,
    filter: "brightness(0.7) contrast(1.6)",
  },

  /** Mostly tooth: the light comes from the facets, not a travelling band. */
  sparkle: {
    id: "silver",
    backgroundImage: `${GRAIN}, repeating-linear-gradient(100deg, #fff6d5 0%, #ffffff 20%, #ffe9f5 40%, #ffffff 60%, #fff6d5 80%)`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "110px 110px, 220% 220%",
    backgroundPosition: "center, var(--combined) center",
    backgroundBlendMode: "screen",
    mixBlendMode: "color-dodge",
    opacity: 0.5,
    // Darker and harder than the others: dodge turns the bright facets into
    // pinpricks and leaves the dark ones alone, which is what separates glitter
    // from a uniform haze.
    filter: "brightness(0.4) contrast(2.8)",
  },
};

export function houseHoloShader(id: HouseHoloShaderId): HoloShader {
  return HOUSE_SHADERS[id];
}
