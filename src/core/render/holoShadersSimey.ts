/**
 * Foil looks adapted from simeydotme poke-holo / poke-151 (GPL-3.0).
 *
 * **Structure** = simey (overlay chains, blend, clip, glare).
 * **Paint** = TCG Live dump plates under `/foil/pokemon/textures/_shared`
 * (same stems as `SHARED_BY_FOIL` in `effects/pokemon/materials`). CSS hue
 * ramps stay only where Live has no drawable plate (regular bars, reverse
 * light mask, sunpillar-style diagonals without a spectrum slot).
 *
 * Vendored reference CSS: `third_party/simeydotme-pokemon-cards-{css,151}/`.
 * Leafs with no simey analogue (Thatch, Tinsel, Squares, Sun*, Stamped,
 * Confetti, SolidColor) stay on APK recipes in `holoShadersPokemon.ts`.
 */

import type { HoloShader } from "@/core/render/holoShaders";

const T = "/foil/pokemon/textures/_shared";
const tex = (stem: string) => `url(${T}/${stem}.webp)`;

const GLITTER = tex("T_Noise_Random");
const GLITTER_GOLD = tex("FX_T_SVUltra_Glitter");
const GSIZE = "25%";
const GRAIN = tex("FX_T_Noise_Dim");
const COSMOS = tex("T_Holofoil_Cosmos_Dots_RGBA_Gradient");
const CLOUD = tex("T_CloudNoise");
/** SwSecret / Rainbow02 spectrum. */
const FOIL = tex("FX_T_Spectrum");
/** Rainbow leaf. */
const FOIL_RAINBOW = tex("FX_T_Spectrum_Rainbow");
const FOIL_FLAT = tex("FX_T_Spectrum_FlatSilver");
const FOIL_GOLD = tex("FX_T_Highlight_Gold_Band");
const FOIL_SV2 = tex("FX_T_Spectrum_SVHolo2");
const FOIL_SV3 = tex("FX_T_Spectrum_SVHolo3");
/** Live `_CardEtch` via `HoloCardImage` `--foil-etch` (already inverted). */
const FOIL_ETCH =
  "var(--foil-etch, linear-gradient(hsl(0, 0%, 8%), hsl(0, 0%, 14%)))";
const FOIL_VERTICAL = tex("FX_T_Spectrum_Bands_Vertical");
const FOIL_ANGLED = tex("FX_T_Spectrum_Bands_Angled");
const FOIL_DESAT = tex("FX_T_Spectrum_Bands_DesaturateOneSide");
const FOIL_COSMOS = tex("FX_T_Spectrum_Bands_Rainbow_Bright");
const FOIL_BLACK = tex("FX_T_Spectrum_BlackSide");
const SHINE = tex("FX_T_Gradient_Shine");
const HIGHLIGHT = tex("FX_T_Highlight_Over");
const LIGHT_SHEEN = tex("T_Holofoil_Mask_Gradient_LightSheen");
const BAR_WIDE = tex("T_Holofoil_Mask_Bar_Wide_Single");
const BW_BARS = tex("T_Holofoil_Mask_BWBars");

const VIOLET = "var(--violet, #c929f1)";
const BLUE = "var(--blue, #0dbde9)";
const GREEN = "var(--green, #21e985)";
const YELLOW = "var(--yellow, #eedf10)";
const RED = "var(--red, #f80e35)";

const SP1 = "hsl(2, 100%, 73%)";
const SP2 = "hsl(53, 100%, 69%)";
const SP3 = "hsl(93, 100%, 69%)";
const SP4 = "hsl(176, 100%, 76%)";
const SP5 = "hsl(228, 100%, 74%)";
const SP6 = "hsl(283, 100%, 73%)";

/** Simey rainbow-alt lead bands (`rainbow-alt.css`) — structure, not hue source. */
const RAINBOW_ALT_BANDS = `repeating-linear-gradient(var(--angle, -22deg), hsla(283, 49%, 60%, 0.75) calc(var(--space, 5%) * 1), hsla(2, 70%, 58%, 0.75) calc(var(--space, 5%) * 2), hsla(53, 67%, 53%, 0.75) calc(var(--space, 5%) * 3), hsla(93, 56%, 52%, 0.75) calc(var(--space, 5%) * 4), hsla(176, 38%, 50%, 0.75) calc(var(--space, 5%) * 5), hsla(228, 100%, 77%, 0.75) calc(var(--space, 5%) * 6), hsla(283, 49%, 61%, 0.75) calc(var(--space, 5%) * 7))`;

const R1 = "hsl(0, 57%, 37%)";
const R2 = "hsl(40, 53%, 39%)";
const R3 = "hsl(90, 60%, 35%)";
const R4 = "hsl(180, 60%, 35%)";
const R5 = "hsl(180, 60%, 35%)";
const R6 = "hsl(210, 57%, 39%)";
const R7 = "hsl(280, 55%, 31%)";
/** Coat-side pastel wash when Live spectrum is the deep hue (simey :after). */
const RAINBOW_PASTEL = `${R1}, ${R2}, ${R3}, ${R4}, ${R5}, ${R6}, ${R7}, ${R1}, ${R2}, ${R3}, ${R4}, ${R5}, ${R6}, ${R7}, ${R1}`;

const OFF = "var(--pointer-from-center, 0)";
const BX = "var(--background-x, 50%)";
const BY = "var(--background-y, 50%)";
const PX = "var(--pointer-x, var(--colorX, 50%))";
const PY = "var(--pointer-y, var(--colorY, 50%))";
const PL = "var(--pointer-from-left, 0.5)";
const PT = "var(--pointer-from-top, 0.5)";

function lit(base: number, swing: number): string {
  return `calc(${base} + ${OFF} * ${swing})`;
}

function brightFrom(base: number, swing: number): string {
  return `brightness(calc((${OFF} * ${swing}) + ${base}))`;
}

function sunpillar(angle = "0deg"): string {
  return `repeating-linear-gradient(${angle}, ${SP1} calc(var(--space, 5%) * 1), ${SP2} calc(var(--space, 5%) * 2), ${SP3} calc(var(--space, 5%) * 3), ${SP4} calc(var(--space, 5%) * 4), ${SP5} calc(var(--space, 5%) * 5), ${SP6} calc(var(--space, 5%) * 6), ${SP1} calc(var(--space, 5%) * 7))`;
}

function vBars(angle = "133deg"): string {
  return `repeating-linear-gradient(${angle}, #0e152e 0%, hsl(180, 10%, 60%) 3.8%, hsl(180, 29%, 66%) 4.5%, hsl(180, 10%, 60%) 5.2%, #0e152e 10%, #0e152e 12%)`;
}

function spot(): string {
  return `radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(0,0%,0%,0.1) 12%, hsla(0,0%,0%,0.15) 20%, hsla(0,0%,0%,0.25) 120%)`;
}

type PartialLook = Omit<HoloShader, "id"> & {
  overlay?: SimeyHoloShaderId;
};

function L(id: SimeyHoloShaderId, p: PartialLook): HoloShader {
  return { id, ...p };
}

/**
 * Diagonal V / shiny / ex family — Live spectrum (or foil plate) + optional
 * bars + opposite-pan coat. When `spectrumImg` is set it replaces the CSS
 * sunpillar ramp with a dump plate.
 */
function diagonalFamily(
  id: SimeyHoloShaderId,
  coatId: SimeyHoloShaderId,
  foilImg: string,
  shineBright: [number, number],
  coatBright: [number, number],
  coatMix: string,
  blend = "soft-light, hue, hard-light",
  spectrumImg: string = sunpillar("0deg"),
): [HoloShader, HoloShader] {
  const layers = `${foilImg}, ${spectrumImg}, ${vBars()}, ${spot()}`;
  const shine = L(id, {
    backgroundImage: layers,
    backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat",
    backgroundSize: "cover, 200% 700%, 300% 100%, 200% 100%",
    backgroundPosition: `center, 0% ${BY}, ${BX} ${BY}, ${BX} ${BY}`,
    backgroundBlendMode: blend,
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(shineBright[0], shineBright[1])} contrast(1.5) saturate(1.5)`,
    pointerFalloff: false,
    overlay: coatId,
  });
  const coat = L(coatId, {
    backgroundImage: layers,
    backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat",
    backgroundSize: "cover, 200% 400%, 195% 100%, 200% 100%",
    backgroundPosition: `center, 0% ${BY}, calc(${BX} * -1) calc(${BY} * -1), ${BX} ${BY}`,
    backgroundBlendMode: blend,
    mixBlendMode: coatMix,
    opacity: 0.9,
    filter: `${brightFrom(coatBright[0], coatBright[1])} contrast(1.5) saturate(1.25)`,
    pointerFalloff: false,
  });
  return [shine, coat];
}

/** SwHolo — Live vertical spectrum + BW bar plate. */
const [vRegular, vRegularCoat] = diagonalFamily(
  "vRegular",
  "vRegularCoat",
  BW_BARS,
  [0.8, 0.15],
  [1, 0.2],
  "soft-light",
  "screen, hue, hard-light",
  FOIL_VERTICAL,
);

/** SvUltra — rainbow spectrum + glitter tooth as foil plate. */
const [vFullArt, vFullArtCoat] = diagonalFamily(
  "vFullArt",
  "vFullArtCoat",
  GLITTER_GOLD,
  [0.4, 0.4],
  [0.8, 0.4],
  "exclusion",
  "soft-light, hue, hard-light",
  FOIL_RAINBOW,
);

/** AceFoil — BlackSide spectrum + Gradient_Shine. */
const [vMax, vMaxCoat] = diagonalFamily(
  "vMax",
  "vMaxCoat",
  SHINE,
  [0.4, 0.4],
  [0.5, 0.3],
  "lighten",
  "difference, luminosity, soft-light",
  FOIL_BLACK,
);

/** SvHolo — SVHolo2/3 tall spectra. */
const [vStar, vStarCoat] = diagonalFamily(
  "vStar",
  "vStarCoat",
  FOIL_SV3,
  [0.25, 0.75],
  [0.5, 0.75],
  "exclusion",
  "soft-light, hue, hard-light",
  FOIL_SV2,
);

/** FlatSilver — FlatSilver spectrum + bar shine. */
const [shinyRare, shinyRareCoat] = diagonalFamily(
  "shinyRare",
  "shinyRareCoat",
  BAR_WIDE,
  [0.4, 0.4],
  [0.8, 0.4],
  "exclusion",
  "soft-light, hue, hard-light",
  FOIL_FLAT,
);

const [shinyV, shinyVCoat] = diagonalFamily(
  "shinyV",
  "shinyVCoat",
  BAR_WIDE,
  [0.35, 0.4],
  [0.7, 0.4],
  "exclusion",
  "soft-light, hue, hard-light",
  FOIL_FLAT,
);

const [exRegular, exRegularCoat] = diagonalFamily(
  "exRegular",
  "exRegularCoat",
  GRAIN,
  [1, 0.1],
  [1.2, 0.1],
  "difference",
  "screen, hue, hard-light",
);

/** AngledPillars — Live angled spectrum. */
const [exFullArt, exFullArtCoat] = diagonalFamily(
  "exFullArt",
  "exFullArtCoat",
  SHINE,
  [0.5, 0.4],
  [0.5, 0.4],
  "exclusion",
  "soft-light, hue, hard-light",
  FOIL_ANGLED,
);

/** CrackedIce — desat spectrum + light sheen. */
const [illustrationRare, illustrationRareCoat] = diagonalFamily(
  "illustrationRare",
  "illustrationRareCoat",
  LIGHT_SHEEN,
  [0.8, 0.15],
  [1, 0.2],
  "soft-light",
  "screen, hue, hard-light",
  FOIL_DESAT,
);

/** SvUltraScodix — gold band + SVHolo2. */
const [hyperRare, hyperRareCoat] = diagonalFamily(
  "hyperRare",
  "hyperRareCoat",
  FOIL_GOLD,
  [0.6, 0.2],
  [0.75, 0.2],
  "hard-light",
  "soft-light, hue, hard-light",
  FOIL_SV2,
);

export const SIMEY_HOLO_SHADER_IDS = [
  "regularHolo",
  "regularHoloBars",
  "reverseHolo",
  "rainbowHolo",
  "rainbowHoloCoat",
  "rainbowAlt",
  "rainbowAltCoat",
  "cosmosHolo",
  "cosmosHoloCoat",
  "amazingRare",
  "amazingRareCoat",
  "secretRare",
  "secretRareCoat",
  "secretRareSparkle",
  "vRegular",
  "vRegularCoat",
  "vFullArt",
  "vFullArtCoat",
  "vMax",
  "vMaxCoat",
  "vStar",
  "vStarCoat",
  "shinyRare",
  "shinyRareCoat",
  "shinyV",
  "shinyVCoat",
  "trainerGalleryHolo",
  "trainerGalleryHoloCoat",
  "pokeBallHolo",
  "pokeBallHoloCoat",
  "exRegular",
  "exRegularCoat",
  "exFullArt",
  "exFullArtCoat",
  "illustrationRare",
  "illustrationRareCoat",
  "hyperRare",
  "hyperRareCoat",
] as const;

export type SimeyHoloShaderId = (typeof SIMEY_HOLO_SHADER_IDS)[number];

export function isSimeyHoloShaderId(
  value: unknown,
): value is SimeyHoloShaderId {
  return (
    typeof value === "string" &&
    (SIMEY_HOLO_SHADER_IDS as readonly string[]).includes(value)
  );
}

const SIMEY_SHADERS: Readonly<Record<SimeyHoloShaderId, HoloShader>> = {
  regularHolo: L("regularHolo", {
    backgroundImage: `repeating-linear-gradient(110deg, ${VIOLET}, ${BLUE}, ${GREEN}, ${YELLOW}, ${RED}, ${VIOLET}, ${BLUE}, ${GREEN}, ${YELLOW}, ${RED}, ${VIOLET}, ${BLUE}, ${GREEN}, ${YELLOW}, ${RED}), repeating-linear-gradient(90deg, hsl(0,0%,0%) 0px, hsl(0,0%,0%) 2px, hsl(0,0%,40%) 2px, hsl(0,0%,40%) 4px)`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "400% 400%, cover",
    backgroundPosition: `calc(((50% - ${BX}) * 2.6) + 50%) calc(((50% - ${BY}) * 3.5) + 50%), center`,
    backgroundBlendMode: "overlay",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `brightness(${lit(1.1, 0.15)}) contrast(${lit(1.1, 0.2)}) saturate(${lit(1.2, 0.2)})`,
    pointerFalloff: false,
    overlay: "regularHoloBars",
  }),

  regularHoloBars: L("regularHoloBars", {
    backgroundImage: `repeating-linear-gradient(90deg, hsl(0,0%,0%) calc(var(--bars, 3%) * 2), hsla(0,0%,70%,1) calc(var(--bars, 3%) * 3), hsl(0,0%,0%) calc(var(--bars, 3%) * 3.5), hsla(0,0%,70%,1) calc(var(--bars, 3%) * 4), hsl(0,0%,0%) calc(var(--bars, 3%) * 5), hsl(0,0%,0%) calc(var(--bars, 3%) * 14)), repeating-linear-gradient(90deg, hsl(0,0%,0%) calc(var(--bars, 3%) * 2), hsla(0,0%,70%,1) calc(var(--bars, 3%) * 3), hsl(0,0%,0%) calc(var(--bars, 3%) * 3.5), hsla(0,0%,70%,1) calc(var(--bars, 3%) * 4), hsl(0,0%,0%) calc(var(--bars, 3%) * 5), hsl(0,0%,0%) calc(var(--bars, 3%) * 10))`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "200% 200%, 200% 200%",
    backgroundPosition: `calc((((50% - ${BX}) * 1.65) + 50%) + (${BY} * 0.5)) ${BX}, calc((((50% - ${BX}) * -0.9) + 50%) - (${BY} * 0.75)) ${BY}`,
    backgroundBlendMode: "screen",
    mixBlendMode: "hard-light",
    opacity: 0.85,
    filter: `brightness(${lit(1.15, 0.1)}) contrast(${lit(1.1, 0.15)})`,
    pointerFalloff: false,
  }),

  reverseHolo: L("reverseHolo", {
    backgroundImage: `radial-gradient(circle at ${PX} ${PY}, #fff 5%, #000 50%, #fff 80%), linear-gradient(-45deg, #000 15%, #fff, #000 85%)`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "120% 120%, 200% 200%",
    backgroundPosition: `center, calc(100% * ${PL}) calc(100% * ${PT})`,
    backgroundBlendMode: "soft-light, difference",
    mixBlendMode: "color-dodge",
    opacity: 0.75,
    filter: `brightness(${lit(0.55, 0.2)}) contrast(${lit(1.5, 0.2)}) saturate(1)`,
    pointerFalloff: false,
  }),

  /** SwSecret — Live `_Spectrum` + noise glitter (simey rainbow choreography). */
  rainbowHolo: L("rainbowHolo", {
    backgroundImage: `${HIGHLIGHT}, ${GLITTER}, ${FOIL}`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: `200% 200%, ${GSIZE} ${GSIZE}, 400% 200%`,
    backgroundPosition: `calc(25% + (50% * ${PL})) calc(25% + (50% * ${PT})), center, calc(25% + (${PX} / 2)) calc(25% + (${PY} / 2))`,
    backgroundBlendMode: "luminosity, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.6, 0.25)} contrast(2.2) saturate(0.75)`,
    pointerFalloff: false,
    overlay: "rainbowHoloCoat",
  }),

  rainbowHoloCoat: L("rainbowHoloCoat", {
    backgroundImage: `${GLITTER}, ${FOIL}`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, 400% 200%`,
    backgroundPosition: `center, ${PX} ${PY}`,
    backgroundBlendMode: "soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.55, 0.3)} contrast(2) saturate(1)`,
    pointerFalloff: false,
  }),

  /**
   * Rainbow leaf — simey rainbow-alt **structure** (pastel bands + glitter +
   * opposite-pan coat) painted with Live `_SpectrumTexture` /
   * `_SpectrumBright`. The text-box moutonnement was flat when Spectrum_Rainbow
   * alone replaced the band stack: Highlight_Over sat under luminosity and
   * never showed grain. Bands lead again; Highlight + CloudNoise soft-light
   * underneath carry the Live tooth into the box.
   */
  rainbowAlt: L("rainbowAlt", {
    backgroundImage: `${RAINBOW_ALT_BANDS}, ${GLITTER}, ${FOIL_RAINBOW}, ${HIGHLIGHT}, ${CLOUD}`,
    backgroundRepeat: "no-repeat, repeat, no-repeat, no-repeat, repeat",
    backgroundSize: `200% 400%, ${GSIZE} ${GSIZE}, 400% 200%, 160% 160%, 280px 280px`,
    backgroundPosition: `0% ${BY}, center, calc(${BX} * 1.5) calc(${BY} * 1.5), calc(${BX} * 1.2) calc(${BY} * 1.2), center`,
    backgroundBlendMode: "luminosity, overlay, soft-light, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.3, 0.3)} contrast(3) saturate(1.8)`,
    pointerFalloff: false,
    overlay: "rainbowAltCoat",
  }),

  rainbowAltCoat: L("rainbowAltCoat", {
    backgroundImage: `${GLITTER}, ${HIGHLIGHT}, ${FOIL_RAINBOW}, linear-gradient(-60deg, ${RAINBOW_PASTEL})`,
    backgroundRepeat: "repeat, no-repeat, no-repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, 180% 180%, 400% 200%, 400% 400%`,
    backgroundPosition: `center, calc(${BX} * -1.2) calc(${BY} * -1.2), calc(${BX} * -1.5) calc(${BY} * -1.5), calc(${BX} * -1.5) calc(${BY} * -1.5)`,
    backgroundBlendMode: "overlay, soft-light, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 0.85,
    filter: `${brightFrom(0.6, 0.5)} contrast(3) saturate(1)`,
    pointerFalloff: false,
  }),

  /** Cosmos — Live Spectrum_Bands_Rainbow_Bright + dots carve + Gradient_Shine. */
  cosmosHolo: L("cosmosHolo", {
    backgroundImage: `${COSMOS}, ${FOIL_COSMOS}, ${SHINE}, radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(180, 100%, 89%, 0.5) 5%, hsla(180, 14%, 57%, 0.3) 40%, hsl(0, 0%, 0%) 130%)`,
    backgroundRepeat: "repeat, no-repeat, no-repeat, no-repeat",
    backgroundSize: "cover, 400% 900%, 220% 220%, cover",
    backgroundPosition: `center, calc(10% + (${PL} * 80%)) calc(10% + (${PT} * 80%)), calc(50% + (${PL} - 0.5) * 40%) center, center`,
    backgroundBlendMode: "color-burn, multiply, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `brightness(${lit(1, 0.15)}) contrast(${lit(1, 0.2)}) saturate(${lit(0.8, 0.2)})`,
    pointerFalloff: false,
    overlay: "cosmosHoloCoat",
    carve: {
      url: `${T}/T_Holofoil_Cosmos_Dots_RGBA_Gradient.webp`,
      size: "260px 260px",
      repeat: "repeat",
    },
  }),

  cosmosHoloCoat: L("cosmosHoloCoat", {
    backgroundImage: `${CLOUD}, ${FOIL_COSMOS}`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "cover, 400% 900%",
    backgroundPosition: `center, calc(15% + (${PL} * 70%)) calc(15% + (${PT} * 70%))`,
    backgroundBlendMode: "lighten, multiply",
    mixBlendMode: "overlay",
    opacity: 0.9,
    filter: `brightness(${lit(1.25, 0.1)}) contrast(${lit(1.75, 0.15)}) saturate(0.8)`,
    pointerFalloff: false,
  }),

  /** Galaxy — Live vertical spectrum + glitter + galaxy-star carve. */
  amazingRare: L("amazingRare", {
    backgroundImage: `${GLITTER_GOLD}, ${FOIL_VERTICAL}, ${CLOUD}, radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(150, 20%, 10%, 1) 10%, hsla(177, 22%, 80%, 0.1) 50%, hsla(0, 0%, 95%, 0.98) 90%)`,
    backgroundRepeat: "repeat, no-repeat, repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, 200% 400%, 380px 380px, cover`,
    backgroundPosition: "40% 45%, 0% 50%, center, center",
    backgroundBlendMode: "soft-light, color-burn, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `brightness(${lit(1, 0.15)}) contrast(1) saturate(0.9)`,
    pointerFalloff: false,
    overlay: "amazingRareCoat",
    carve: {
      url: `${T}/T_Holofoil_Galaxy_Stars.webp`,
      size: "300px 300px",
      repeat: "repeat",
    },
  }),

  amazingRareCoat: L("amazingRareCoat", {
    backgroundImage: FOIL_VERTICAL,
    backgroundRepeat: "no-repeat",
    backgroundSize: "400% 800%",
    backgroundPosition: `calc(50% + (50% - ${BX}) * 3) calc(50% + (50% - ${BY}) * 3)`,
    mixBlendMode: "saturation",
    opacity: 0.85,
    filter: `brightness(calc(0.75 - (${OFF} * 0.5))) contrast(1) saturate(1)`,
    pointerFalloff: false,
  }),

  /** SvUltraGoldRainbow — simey secret-rare + Live plates.
   *
   * Stack = poke-holo `secret-rare.css` (glitter×2 + conic + radial + coat foil
   * + gold ramp + sparkle). Live fills gaps: SVHolo2 scrollY (Unity green),
   * `--foil-etch`, Gold_Band. **Full-card** (ShaderKit `secretRareGold`) —
   * white-plate as CSS mask greys the figure and punches a silhouette.
   * Etch paint is the **raw** Live plate (Ultra Gold: bright figure / dark
   * ornaments) — Radiant-style invert blacks the figure under soft-light.
   * Shine: quiet color-dodge (simey) but heavily pre-dimmed — Live gold art
   * bleaches at poke-holo’s 0.4/sat 2.7. Coat soft-light with raw etch × gold.
   */
  secretRare: L("secretRare", {
    // Simey conic = clr-4,5,6,1,4; SP3 (green) inserted for Unity SVHolo2 hue.
    backgroundImage: `${GLITTER_GOLD}, ${GLITTER_GOLD}, conic-gradient(${SP4}, ${SP5}, ${SP6}, ${SP1}, ${SP3}, ${SP4}), ${FOIL_SV2}, radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(150, 0%, 0%, 0.9) 10%, hsla(0, 0%, 90%, 0.1) 90%)`,
    backgroundRepeat: "repeat, repeat, no-repeat, repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, ${GSIZE} ${GSIZE}, cover, 100% 300%, cover`,
    backgroundPosition: `45% 45%, 55% 55%, center, 0% ${BY}, center`,
    backgroundBlendMode: "soft-light, hard-light, overlay, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 0.4,
    filter: `${brightFrom(0.18, 0.14)} contrast(1.1) saturate(1.9)`,
    pointerFalloff: false,
    overlay: "secretRareCoat",
  }),

  secretRareCoat: L("secretRareCoat", {
    // Raw Live etch first (multiply burns dark ornaments into the gold field).
    backgroundImage: `${FOIL_ETCH}, ${FOIL_GOLD}, linear-gradient(45deg, hsl(46, 65%, 45%), hsl(52, 70%, 58%)), radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(40, 12%, 72%, 0.4) 10%, hsl(0, 0%, 0%) 75%)`,
    backgroundRepeat: "no-repeat, no-repeat, no-repeat, no-repeat",
    backgroundSize: "cover, cover, cover, cover",
    backgroundPosition: "center, center, center, center",
    // multiply only *inside* the stack (etch × gold); soft-light onto the card
    // so we don't muddy the Live gold diffuse.
    backgroundBlendMode: "multiply, soft-light, multiply",
    mixBlendMode: "soft-light",
    opacity: 0.55,
    filter: `brightness(${lit(1.02, 0.08)}) contrast(1.25) saturate(0.5)`,
    pointerFalloff: false,
    overlay: "secretRareSparkle",
  }),

  /** Simey `.card__shine:after` — pointer-shifted glitter tooth. */
  secretRareSparkle: L("secretRareSparkle", {
    backgroundImage: GLITTER_GOLD,
    backgroundRepeat: "repeat",
    backgroundSize: `${GSIZE} ${GSIZE}`,
    backgroundPosition: `calc(50% - (2px * ${PL}) + 1px) calc(50% - (2px * ${PT}) + 1px)`,
    mixBlendMode: "overlay",
    opacity: 0.28,
    filter: `brightness(calc((${OFF} * 0.35) + 0.3)) contrast(1.3)`,
    pointerFalloff: false,
  }),

  vRegular,
  vRegularCoat,
  vFullArt,
  vFullArtCoat,
  vMax,
  vMaxCoat,
  vStar,
  vStarCoat,
  shinyRare,
  shinyRareCoat,
  shinyV,
  shinyVCoat,

  /** Rainbow02 — Live Spectrum + Highlight_Over (trainer-gallery structure). */
  trainerGalleryHolo: L("trainerGalleryHolo", {
    backgroundImage: `${FOIL}, ${HIGHLIGHT}`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "300% 400%, 250% 250%",
    backgroundPosition: `0% ${BY}, calc(${BX} * 1.2) calc(${BY} * 1.2)`,
    backgroundBlendMode: "soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.5, 0.3)} contrast(2.3) saturate(1)`,
    pointerFalloff: false,
    overlay: "trainerGalleryHoloCoat",
  }),

  trainerGalleryHoloCoat: L("trainerGalleryHoloCoat", {
    backgroundImage: `${HIGHLIGHT}, radial-gradient(farthest-corner ellipse at calc((${PX} * 0.5) + 25%) calc((${PY} * 0.5) + 25%), hsl(0, 0%, 95%) 10%, hsl(0, 0%, 20%) 90%)`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "220% 220%, 400% 500%",
    backgroundPosition: "center, center",
    backgroundBlendMode: "soft-light",
    mixBlendMode: "hard-light",
    opacity: 0.85,
    filter: `${brightFrom(0.4, 0.2)} contrast(0.85) saturate(1.1)`,
    pointerFalloff: false,
  }),

  /** FlatSilver_CC — TEX_CC_PB carve + FlatSilver spectrum + glitter. */
  pokeBallHolo: L("pokeBallHolo", {
    backgroundImage: `${FOIL_FLAT}, ${GLITTER_GOLD}, ${BAR_WIDE}`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: `200% 200%, ${GSIZE} ${GSIZE}, 100% 100%`,
    backgroundPosition: `${PX} ${PY}, center, center`,
    backgroundBlendMode: "soft-light, multiply",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `brightness(${lit(0.75, 0.15)}) contrast(1) saturate(1)`,
    pointerFalloff: false,
    overlay: "pokeBallHoloCoat",
    carve: { url: `${T}/TEX_CC_PB.webp`, size: "190px 190px", repeat: "repeat" },
  }),

  pokeBallHoloCoat: L("pokeBallHoloCoat", {
    backgroundImage: `${FOIL_SV2}, ${SHINE}`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "100% 220%, 200% 200%",
    backgroundPosition: `${PX} ${PY}, ${PX} ${PY}`,
    backgroundBlendMode: "soft-light",
    mixBlendMode: "lighten",
    opacity: 0.85,
    filter: `brightness(${lit(0.55, 0.2)}) contrast(1.8) saturate(calc(${OFF} * 1.1 + 0.3))`,
    pointerFalloff: false,
  }),

  exRegular,
  exRegularCoat,
  exFullArt,
  exFullArtCoat,
  /** CrackedIce — Live desat spectrum + light sheen; cracks via carve plate. */
  illustrationRare: {
    ...illustrationRare,
    carve: {
      url: `${T}/T_Holofoil_Mask_Cracked_Ice_RGB.webp`,
      size: "100% 100%",
      repeat: "no-repeat",
    },
  },
  illustrationRareCoat,
  hyperRare,
  hyperRareCoat,
};

export function simeyHoloShader(id: SimeyHoloShaderId): HoloShader {
  return SIMEY_SHADERS[id];
}
