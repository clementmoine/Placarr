import type {
  HoloShader,
  HoloShaderId,
  HoloTuning,
} from "@/core/render/holoShaders";

/**
 * The same looks, rebuilt on the mobile app's own textures.
 *
 * **These are not the app's shaders.** Those exist in this codebase now — the
 * GLES3 build ships them as GLSL text and `core/render/foil` runs them
 * verbatim on WebGL2, see `docs/tcg_support.md` §9. This file predates that
 * discovery and stays for what it is: the app's texture set drawn through CSS
 * blend modes, for wherever a canvas is not an option.
 *
 * That set is the interesting difference. The web viewer shares a handful of
 * generic textures across every finish; the app gives each one its own motif
 * **and its own colour ramp** — eight distinct `RainbowGradient*`, plus a
 * dedicated `InkwashMask` and three varnish surfaces. Two cards can therefore
 * differ in hue in the app while our CSS draws them through the same shared
 * `color.jpg`, which is most of why its rendering reads richer at equal finish.
 *
 * The composition here is ours: the blend structure of the transcribed web
 * recipe (which is proven against the publisher's stylesheet) with the app's
 * per-effect textures swapped in. Where a finish shares a shader graph in the
 * app, its ramp is shared here too — `magma` and `calendarWave` both run on
 * `CardFoilLore`, so both take the Lore ramp.
 *
 * Kept beside the web set rather than replacing it, so the parity test keeps
 * meaning something while these are judged by eye.
 */

/** Where the extracted textures live, apart from the web viewer's own. */
const A = "/assets/app";

/**
 * `freeForm` splits in two here.
 *
 * The web viewer draws `FreeForm1` and `FreeForm2` with one grouped selector,
 * so a single look was faithful to it. The app ships two distinct patterns, so
 * the split only exists on this side.
 */
export type AppHoloShaderId = HoloShaderId | "freeForm2";

export const APP_HOLO_SHADER_IDS = [
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
  "freeForm2",
  "tempest",
  "calendarWave",
  "loreShine",
  "satinShine",
  "hotFoil",
  "chromeRainbowHotFoil",
] as const satisfies readonly AppHoloShaderId[];

const APP_SHADERS: Readonly<Record<AppHoloShaderId, HoloShader>> = {
  /** Achromatic by nature, so its own shine texture carries it, not a ramp. */
  silver: {
    id: "silver",
    backgroundImage: `url(${A}/silvershine.png), url(${A}/inkwashmask.png)`,
    backgroundRepeat: "repeat-x, no-repeat",
    backgroundSize: "300% 100%, cover",
    backgroundPosition: "var(--colorX) center, center",
    backgroundBlendMode: "exclusion",
    mixBlendMode: "hard-light",
    opacity: 0.5,
    filter: "brightness(1.6) saturate(0.2) invert()",
  },

  satin: {
    id: "satin",
    backgroundImage: `url(${A}/rainbowgradientsatinwide.png), url(${A}/satinfoilnoise.png)`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "175% 100%, cover",
    backgroundPosition:
      "calc(var(--colorX) * 1 + var(--colorY)) center, center",
    backgroundBlendMode: "normal, multiply",
    mixBlendMode: "exclusion",
    filter: "brightness(0.5)",
    overlay: "satinShine",
  },

  lore: {
    id: "lore",
    backgroundImage: `url(${A}/rainbowgradientlore.png), url(${A}/lorepattern.png)`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "250% 100%, cover",
    backgroundPosition: "calc(var(--combined) / 2) center, center",
    backgroundBlendMode: "multiply, normal",
    mixBlendMode: "exclusion",
    filter: "brightness(0.5)",
    overlay: "loreShine",
  },

  /** Runs on the app's default holo graph, so it takes the generic wash. */
  lava: {
    id: "lava",
    backgroundImage: `url(${A}/inkwashmask.png), url(${A}/rainbowgradientinkwash.png)`,
    backgroundRepeat: "no-repeat, repeat",
    backgroundSize: "cover, 300% 300%",
    backgroundPosition: "center, calc(var(--combined) / 1.75) center",
    backgroundBlendMode: "color-burn, soft-light",
    mixBlendMode: "color-dodge",
    filter: "brightness(0.85) contrast(3) saturate(1.5)",
  },

  /** `CardMagmaFoil` runs on `CardFoilLore`, hence the Lore ramp. */
  magma: {
    id: "magma",
    backgroundImage: `url(${A}/rainbowgradientlore.png), url(${A}/magmatexture.png), url(${A}/magmatexture.png)`,
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
    backgroundImage: `url(${A}/glitterpattern.png), url(${A}/rainbowgradienttempestglitter.png), url(${A}/glitterpattern.png)`,
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
    backgroundImage: `url(${A}/vertwavetexture.png), url(${A}/rainbowgradientlore.png), url(${A}/inkwashmask.png)`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: "cover, 600% 100%, cover",
    backgroundPosition: "center, calc(var(--combined) / 3) center, center",
    backgroundBlendMode: "color-burn, multiply, normal",
    mixBlendMode: "hard-light",
    filter: "brightness(0.75) contrast(0.5)",
  },

  seaWave: {
    id: "seaWave",
    backgroundImage: `url(${A}/rainbowgradientseawave.png), url(${A}/seawavepattern.png), url(${A}/inkwashmask.png)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "125% 125%, 100% 50%, 50% 50%",
    backgroundPosition: "calc(var(--combined) * 4) center, center, center",
    backgroundBlendMode: "color-burn, multiply, normal",
    mixBlendMode: "hard-light",
    filter: "brightness(0.5) contrast(0.75)",
  },

  rainbowPillars: {
    id: "rainbowPillars",
    backgroundImage: `url(${A}/rainbowpillarspattern.png), url(${A}/rainbowpillarspattern.png), url(${A}/rainbowgradientlore.png)`,
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
    backgroundImage: `url(${A}/rainbowgradientfreeform.png), url(${A}/freeform1pattern.png), url(${A}/freeform1pattern.png)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "400%, 80% 300%, 80% 200%",
    backgroundPosition:
      "calc(var(--colorX) / 1.75) calc(var(--colorY) / 1.75), calc(var(--colorX) / 4) calc(-1 * var(--colorY) / 8), calc(-1 * (var(--colorX)) / 1.5) calc(-1 * var(--colorY) / 10)",
    backgroundBlendMode: "color, multiply, normal",
    mixBlendMode: "multiply",
    opacity: 0.5,
    filter: "brightness(0.6) contrast(5) saturate(2)",
  },

  /** The half the web viewer never distinguished. */
  freeForm2: {
    id: "freeForm" as HoloShaderId,
    backgroundImage: `url(${A}/rainbowgradientfreeform.png), url(${A}/freeform2pattern.png), url(${A}/freeform2pattern.png)`,
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
    backgroundImage: `url(${A}/tempestpatterns.png), url(${A}/rainbowgradienttempestglitter.png), url(${A}/inkwashmask.png)`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: "cover, 700% 250%, cover",
    backgroundPosition: "center, calc(var(--combined) / 4) center, center",
    backgroundBlendMode: "color-burn, screen, normal",
    mixBlendMode: "color-dodge",
    filter: "brightness(0.8) contrast(2)",
  },

  /** Also on `CardFoilLore`, so also the Lore ramp. */
  calendarWave: {
    id: "calendarWave",
    backgroundImage: `url(${A}/rainbowgradientlore.png), url(${A}/calendarwavepattern.png), url(${A}/inkwashmask.png)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "300% 100%, cover, 50% 50%",
    backgroundPosition: "calc(var(--combined) * 1.5) center, center, center",
    backgroundBlendMode: "color-burn, exclusion, normal",
    mixBlendMode: "multiply",
    opacity: 0.4,
    filter: "contrast(2) saturate(1.5)",
  },

  loreShine: {
    id: "loreShine",
    backgroundImage: `url(${A}/rainbowgradientlore.png)`,
    backgroundRepeat: "repeat",
    backgroundSize: "200% 100%",
    backgroundPosition: "calc(var(--combined) / 2) center",
    mixBlendMode: "screen",
    opacity: 0.5,
  },

  satinShine: {
    id: "satinShine",
    backgroundImage: `url(${A}/rainbowgradientsatin.png)`,
    backgroundRepeat: "repeat",
    backgroundSize: "200% 100%",
    backgroundPosition: "calc(var(--colorX) * 1 + var(--colorY)) center",
    mixBlendMode: "screen",
    opacity: 0.5,
  },

  /** The stamped coat gets the surfaces the web viewer never had. */
  hotFoil: {
    id: "hotFoil",
    backgroundImage: `linear-gradient(90deg, #333 20%, var(--topcolor) 50%, #333 80%), url(${A}/varnishshine.png), url(${A}/varnishsurface.png)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "300% 300%, 200% 100%, 50% 50%",
    backgroundPosition: "var(--colorX) center, var(--colorX) center, center",
    backgroundBlendMode: "screen, overlay",
    mixBlendMode: "color-dodge",
  },

  chromeRainbowHotFoil: {
    id: "chromeRainbowHotFoil",
    backgroundImage: `linear-gradient(90deg, #333 20%, var(--topcolor) 50%, #333 80%), url(${A}/rainbowgradientgold.png), url(${A}/varnishshinebroad.png)`,
    backgroundRepeat: "repeat, repeat, repeat",
    backgroundSize: "300% 300%, 200% 100%, 75% 75%",
    backgroundPosition:
      "var(--colorX) center, var(--colorX) var(--colorY), var(--colorX) var(--colorY)",
    backgroundBlendMode: "darken, screen",
    mixBlendMode: "color",
  },
};

/**
 * The values each effect actually ships with, read off the app's materials.
 *
 * Not knobs — settings. The whole point of dumping them is that they *differ*:
 * `_Inkwash_Strength` runs from 0.1 on Tempest to 1.1 on Magma, and that spread
 * is a good part of what makes the two look nothing alike. A slider that moved
 * them together would erase exactly the thing worth having.
 *
 * Deliberately absent, because the dump shows them identical on every material
 * and so they carry no per-effect signal: `_MotifColorWeight` (0.5 throughout)
 * and `_Speed` (0.15 throughout). Recording them as knobs would have implied a
 * distinction the data does not contain.
 *
 * Source material named per entry so any value can be re-checked against the
 * dump rather than taken on trust.
 */
type RecordedParams = {
  /** `_Inkwash_Strength` — the dark wash. The widest-spread axis, 0.1 … 1.1. */
  inkwash?: number;
  /** `_RainbowStrength` — only Satin departs from 1. */
  rainbow?: number;
  /** `_GlitterSize` — the grain's own scale, where a look has one. */
  glitter?: number;
};

const RECORDED: Readonly<Record<AppHoloShaderId, RecordedParams>> = {
  silver: {}, // CardFoilSilver — no wash at all, which is why it reads clean
  satin: { rainbow: 0.882 }, // CardFoilSatin — the only look under full rainbow
  lore: { inkwash: 0.9, glitter: 1.1 }, // CardLoreMetallicHotFoil
  lava: { inkwash: 0.55 }, // CardFoilLava
  magma: { inkwash: 1.1, glitter: 1.1 }, // CardMagmaFoil — the heaviest wash
  glitter: { inkwash: 0.5, glitter: 1.1 }, // CardFoilGlitter
  verticalWave: { inkwash: 0.55 }, // CardFoilVertWave
  seaWave: { inkwash: 0.65, glitter: 1.1 }, // CardFoilSeaWave
  rainbowPillars: { inkwash: 0.55 }, // CardRainbowPillarsFoil
  freeForm: { inkwash: 0.9 }, // CardFreeForm1Foil
  freeForm2: { inkwash: 0.9 }, // CardFreeForm2Foil
  tempest: { inkwash: 0.1 }, // CardFoilTempest — the lightest, by a long way
  calendarWave: { inkwash: 0.65, glitter: 1.1 }, // CardFoilCalendarWave
  loreShine: {},
  satinShine: {},
  hotFoil: {},
  chromeRainbowHotFoil: {},
};

/** The recorded settings for a look, for display and for derivation. */
export function appRecordedParams(id: AppHoloShaderId): RecordedParams {
  return RECORDED[id];
}

export function appHoloShader(id: AppHoloShaderId): HoloShader {
  return APP_SHADERS[id];
}

/**
 * The recorded settings as the render layer wants them.
 *
 * `glitter` becomes `grain` because that is what the CSS side scales — the
 * background's own tile size. Absent values stay absent rather than defaulting
 * to 1, so a look the app gives no wash draws with none instead of a neutral
 * one, which is a different thing.
 */
export function appRecordedTuning(id: AppHoloShaderId): HoloTuning {
  const recorded = RECORDED[id];
  return {
    rainbow: recorded.rainbow,
    inkwash: recorded.inkwash,
    grain: recorded.glitter,
  };
}
