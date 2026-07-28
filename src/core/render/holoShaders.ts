import type { CSSProperties } from "react";

/**
 * The looks a foil printing can be drawn with.
 *
 * These are not invented. They are the recipes the publisher's own card viewer
 * uses, transcribed from it — see `docs/foil_recipes.md`, which keeps the
 * originals verbatim so any change here can be checked against the source.
 *
 * The shape of a look is worth understanding before touching one. It is *not* a
 * gradient. Each finish is two or three photographed foil textures stacked and
 * blended against each other (`backgroundBlendMode`), and the stack as a whole
 * blended onto the artwork (`mixBlendMode`) through a filter. An earlier
 * attempt here built gradients by eye and tuned them over several rounds; no
 * amount of tuning was going to arrive at `exclusion` over `hard-light` under
 * `brightness(1.6) saturate(.2) invert()`.
 *
 * Positions are expressed against custom properties the card container sets,
 * and nothing else:
 *
 * - `--colorX` / `--colorY` — pointer position as a percentage, 50% at rest
 * - `--combined` — their sum, 100% at rest
 * - `--topcolor` — the hue a stamped varnish throws
 *
 * Which finish maps to which look belongs to the provider that knows the finish
 * names, never to this file.
 */
export type HoloShader = {
  id: HoloShaderId;
  /** Comma-separated `background-image` layers. */
  backgroundImage: string;
  backgroundRepeat: string;
  backgroundSize: string;
  /** Usually a function of `--colorX` / `--colorY` / `--combined`. */
  backgroundPosition: string;
  /** How the layers blend against each other, before reaching the artwork. */
  backgroundBlendMode?: string;
  /** How the finished stack blends onto the artwork. */
  mixBlendMode: string;
  opacity?: number;
  filter?: string;
};

export const HOLO_SHADER_IDS = [
  "silver",
  "satin",
  "lore",
  "lava",
  "magma",
  "glitter",
  "verticalWave",
  "seaWave",
  "rainbowPillars",
  "freeForm",
  "tempest",
  "calendarWave",
  "hotFoil",
  "chromeRainbowHotFoil",
] as const;

export type HoloShaderId = (typeof HOLO_SHADER_IDS)[number];

/** Where the transcribed textures live. */
const T = "/foil";

const SHADERS: Readonly<Record<HoloShaderId, HoloShader>> = {
  /** The everyday foil, on 2703 of 3154 prints. Achromatic, and inverted. */
  silver: {
    id: "silver",
    backgroundImage: `url(${T}/silverc.jpg), url(${T}/satin.jpg)`,
    backgroundRepeat: "repeat-x, no-repeat",
    backgroundSize: "300% 100%, 100% 100%",
    backgroundPosition: "var(--colorX) center, center",
    backgroundBlendMode: "exclusion",
    mixBlendMode: "hard-light",
    opacity: 0.5,
    filter: "brightness(1.6) saturate(0.2) invert()",
  },

  satin: {
    id: "satin",
    backgroundImage: `url(${T}/satinc.png), url(${T}/satin.jpg)`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "175% 100%, cover",
    backgroundPosition:
      "calc(var(--colorX) * 1 + var(--colorY)) center, center",
    backgroundBlendMode: "normal, multiply",
    mixBlendMode: "exclusion",
    filter: "brightness(0.5)",
  },

  /** Iconique. Ten prints in the whole game. */
  lore: {
    id: "lore",
    backgroundImage: `url(${T}/vertwavec.jpg), url(${T}/satin.jpg)`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "250% 100%, cover",
    backgroundPosition: "calc(var(--combined) / 2) center, center",
    backgroundBlendMode: "multiply, normal",
    mixBlendMode: "exclusion",
    filter: "brightness(0.5)",
  },

  lava: {
    id: "lava",
    backgroundImage: `url(${T}/lava2.jpg), repeating-linear-gradient(65deg, #0004 12.5%, #2b1fdf44 25%, #00a8bf44 37.5%, #36fc3844 50%, #ccc00044 62.5%, #d004 75%, #0004 87.5%)`,
    backgroundRepeat: "no-repeat, repeat",
    backgroundSize: "cover, 300% 300%",
    backgroundPosition: "center, calc(var(--combined) / 1.75) center",
    backgroundBlendMode: "color-burn, soft-light",
    mixBlendMode: "color-dodge",
    filter: "brightness(0.85) contrast(3) saturate(1.5)",
  },

  magma: {
    id: "magma",
    backgroundImage: `url(${T}/vertwavec.jpg), url(${T}/magma.jpg), url(${T}/magma.jpg)`,
    backgroundRepeat: "no-repeat, repeat, repeat",
    backgroundSize: "150% 100%, 125% 125%, 125% 125%",
    backgroundPosition:
      "calc(var(--combined) / 1.5) center, calc(var(--colorX) / 8) calc(var(--colorY) / 10), calc(-1 * var(--colorX) / 10) calc(-1 * var(--colorY) / 8)",
    backgroundBlendMode: "color, difference",
    mixBlendMode: "hard-light",
    opacity: 0.625,
  },

  glitter: {
    id: "glitter",
    backgroundImage: `url(${T}/glitter.jpg), url(${T}/ff2c.jpg), url(${T}/glitter.jpg)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "12.5% 12.5%, 350% 125%, 25% 25%",
    backgroundPosition: "center, var(--combined) var(--combined), center",
    backgroundBlendMode: "color-burn, darken, normal",
    mixBlendMode: "exclusion",
    opacity: 0.4,
    filter: "brightness(4) invert()",
  },

  verticalWave: {
    id: "verticalWave",
    backgroundImage: `url(${T}/vertwave.jpg), url(${T}/vertwavec.jpg), url(${T}/satin.jpg)`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: "cover, 600% 100%, cover",
    backgroundPosition: "center, calc(var(--combined) / 3) center, center",
    backgroundBlendMode: "color-burn, multiply, normal",
    mixBlendMode: "hard-light",
    filter: "brightness(0.75) contrast(0.5)",
  },

  seaWave: {
    id: "seaWave",
    backgroundImage: `url(${T}/seawavec.jpg), url(${T}/seawave.jpg), url(${T}/satin.jpg)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "125% 125%, 100% 50%, 50% 50%",
    backgroundPosition: "calc(var(--combined) * 4) center, center, center",
    backgroundBlendMode: "color-burn, multiply, normal",
    mixBlendMode: "hard-light",
    filter: "brightness(0.5) contrast(0.75)",
  },

  rainbowPillars: {
    id: "rainbowPillars",
    backgroundImage: `url(${T}/pillar.jpg), url(${T}/pillar2.jpg), url(${T}/color.jpg)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "150% 150%, 140% 150%, 90% 90%",
    backgroundPosition:
      "calc(var(--combined) / 2) bottom, calc(var(--combined) / 4) top, calc(var(--combined) / 2) center",
    backgroundBlendMode: "color-dodge, darken, normal",
    mixBlendMode: "hard-light",
    opacity: 0.25,
    filter: "brightness(0.75) contrast(5) saturate(4)",
  },

  freeForm: {
    id: "freeForm",
    backgroundImage: `url(${T}/ff2c.jpg), url(${T}/ff2.jpg), url(${T}/ff2.jpg)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "400%, 80% 300%, 80% 200%",
    backgroundPosition:
      "calc(var(--colorX) / 1.75) calc(var(--colorY) / 1.75), calc(var(--colorX) / 4) calc(-1 * var(--colorY) / 8), calc(-1 * (var(--colorX)) / 1.5) calc(-1 * var(--colorY) / 10)",
    backgroundBlendMode: "color, multiply, normal",
    mixBlendMode: "multiply",
    opacity: 0.5,
    filter: "brightness(0.6) contrast(5) saturate(2)",
  },

  tempest: {
    id: "tempest",
    backgroundImage: `url(${T}/tempest.jpg), url(${T}/vertwavec.jpg), url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='500' height='500'%3e%3cfilter id='n'%3e%3cfeTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='10' stitchTiles='stitch'/%3e%3c/filter%3e%3crect width='500' height='500' fill='%23000'/%3e%3crect width='500' height='500' filter='url(%23n)' opacity='0.3'/%3e%3c/svg%3e")`,
    backgroundRepeat: "no-repeat, repeat, repeat",
    backgroundSize: "cover, 300% 100%, 50% 50%",
    backgroundPosition: "center, calc(var(--combined) / 2) center, center",
    backgroundBlendMode: "color-burn, multiply",
    mixBlendMode: "hard-light",
    filter: "brightness(0.75) contrast(1.5)",
  },

  calendarWave: {
    id: "calendarWave",
    backgroundImage: `url(${T}/calc.jpg), url(${T}/calendarwave.jpg), url(${T}/satin.jpg)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "300% 100%, cover, 50% 50%",
    backgroundPosition: "calc(var(--combined) * 1.5) center, center, center",
    backgroundBlendMode: "color-burn, exclusion, normal",
    mixBlendMode: "multiply",
    opacity: 0.4,
    filter: "contrast(2) saturate(1.5)",
  },

  /**
   * The varnish coat, stamped onto the art's own line work rather than laid
   * over the card. A second, independent axis: a print can be Enchanted *and*
   * hot-foiled, and the two are stamped separately.
   */
  hotFoil: {
    id: "hotFoil",
    backgroundImage: `url(${T}/satind.png), linear-gradient(90deg, transparent 50%, var(--topcolor) 60%, transparent 80%)`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "50% 50%, 300% 300%",
    backgroundPosition: "center, var(--colorX) center",
    backgroundBlendMode: "exclusion",
    mixBlendMode: "screen",
    filter: "contrast(1.25) saturate(1.5)",
  },

  chromeRainbowHotFoil: {
    id: "chromeRainbowHotFoil",
    backgroundImage: `linear-gradient(90deg, #333 20%, var(--topcolor) 50%, #333 80%), url(${T}/color.jpg)`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "300% 300%, 75% 75%",
    backgroundPosition: "var(--colorX) center, var(--colorX) var(--colorY)",
    backgroundBlendMode: "darken",
    mixBlendMode: "color",
  },
};

/** What an unrecognized or missing finish falls back to. */
export const DEFAULT_HOLO_SHADER_ID: HoloShaderId = "silver";

/**
 * What an unrecognized varnish falls back to. Its own default, because the two
 * axes are not interchangeable: an unknown coat should stay out of the way,
 * where an unknown foil should still look like foil.
 */
export const DEFAULT_VARNISH_SHADER_ID: HoloShaderId = "hotFoil";

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

/** The look for a varnish id, or the plain stamped coat. */
export function varnishShader(id: string | null | undefined): HoloShader {
  return isHoloShaderId(id) ? SHADERS[id] : SHADERS[DEFAULT_VARNISH_SHADER_ID];
}

/** The inline style a look resolves to, ready for the layer element. */
export function holoLayerStyle(shader: HoloShader): CSSProperties {
  return {
    backgroundImage: shader.backgroundImage,
    backgroundRepeat: shader.backgroundRepeat,
    backgroundSize: shader.backgroundSize,
    backgroundPosition: shader.backgroundPosition,
    backgroundBlendMode: shader.backgroundBlendMode,
    mixBlendMode: shader.mixBlendMode as CSSProperties["mixBlendMode"],
    opacity: shader.opacity,
    filter: shader.filter,
  };
}
