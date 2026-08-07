/**
 * Foil looks adapted from simeydotme poke-holo / poke-151 (GPL-3.0).
 *
 * Vendored reference CSS: `third_party/simeydotme-pokemon-cards-{css,151}/`
 * (see `third_party/README.md`). Leafs with no simey analogue (Thatch, Tinsel,
 * Squares, Sun*, Stamped, Confetti, SolidColor) stay on APK recipes in
 * `holoShadersPokemon.ts`.
 */

import type { HoloShader } from "@/core/render/holoShaders";

const T = "/foil/pokemon/textures/_shared";
const GLITTER = `url(${T}/T_Noise_Random.webp)`;
const GLITTER_GOLD = `url(${T}/FX_T_SVUltra_Glitter.webp)`;
const GSIZE = "25%";
const GRAIN = `url(${T}/FX_T_Noise_Dim.webp)`;
const COSMOS = `url(${T}/T_Holofoil_Cosmos_Dots_RGBA_Gradient.webp)`;
const CLOUD = `url(${T}/T_CloudNoise.webp)`;
const FOIL = `url(${T}/FX_T_Spectrum.webp)`;
const FOIL_FLAT = `url(${T}/FX_T_Spectrum_FlatSilver.webp)`;
const FOIL_GOLD = `url(${T}/FX_T_Highlight_Gold_Band.webp)`;

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

const R1 = "hsl(0, 57%, 37%)";
const R2 = "hsl(40, 53%, 39%)";
const R3 = "hsl(90, 60%, 35%)";
const R4 = "hsl(180, 60%, 35%)";
const R5 = "hsl(180, 60%, 35%)";
const R6 = "hsl(210, 57%, 39%)";
const R7 = "hsl(280, 55%, 31%)";
const RAINBOW = `${R1}, ${R2}, ${R3}, ${R4}, ${R5}, ${R6}, ${R7}, ${R1}, ${R2}, ${R3}, ${R4}, ${R5}, ${R6}, ${R7}, ${R1}, ${R2}, ${R3}, ${R4}, ${R5}, ${R6}, ${R7}, ${R1}`;

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

const COSMOS_BANDS = `repeating-linear-gradient(82deg, hsl(53, 65%, 60%) calc(var(--space, 4%) * 1), hsl(93, 56%, 50%) calc(var(--space, 4%) * 2), hsl(176, 54%, 49%) calc(var(--space, 4%) * 3), hsl(228, 59%, 55%) calc(var(--space, 4%) * 4), hsl(283, 60%, 55%) calc(var(--space, 4%) * 5), hsl(326, 59%, 51%) calc(var(--space, 4%) * 6), hsl(326, 59%, 51%) calc(var(--space, 4%) * 7), hsl(283, 60%, 55%) calc(var(--space, 4%) * 8), hsl(228, 59%, 55%) calc(var(--space, 4%) * 9), hsl(176, 54%, 49%) calc(var(--space, 4%) * 10), hsl(93, 56%, 50%) calc(var(--space, 4%) * 11), hsl(53, 65%, 60%) calc(var(--space, 4%) * 12))`;

type PartialLook = Omit<HoloShader, "id"> & {
  overlay?: SimeyHoloShaderId;
};

function L(id: SimeyHoloShaderId, p: PartialLook): HoloShader {
  return { id, ...p };
}

/** Diagonal V / shiny / ex family — foil + sunpillar + bars + opposite-pan coat. */
function diagonalFamily(
  id: SimeyHoloShaderId,
  coatId: SimeyHoloShaderId,
  foilImg: string,
  shineBright: [number, number],
  coatBright: [number, number],
  coatMix: string,
  blend = "soft-light, hue, hard-light",
): [HoloShader, HoloShader] {
  const layers = `${foilImg}, ${sunpillar("0deg")}, ${vBars()}, ${spot()}`;
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

const [vRegular, vRegularCoat] = diagonalFamily(
  "vRegular",
  "vRegularCoat",
  GRAIN,
  [0.8, 0.15],
  [1, 0.2],
  "soft-light",
  "screen, hue, hard-light",
);

const [vFullArt, vFullArtCoat] = diagonalFamily(
  "vFullArt",
  "vFullArtCoat",
  FOIL,
  [0.4, 0.4],
  [0.8, 0.4],
  "exclusion",
);

const [vMax, vMaxCoat] = diagonalFamily(
  "vMax",
  "vMaxCoat",
  FOIL,
  [0.4, 0.4],
  [0.5, 0.3],
  "lighten",
  "difference, luminosity, soft-light",
);

const [vStar, vStarCoat] = diagonalFamily(
  "vStar",
  "vStarCoat",
  FOIL,
  [0.25, 0.75],
  [0.5, 0.75],
  "exclusion",
);

const [shinyRare, shinyRareCoat] = diagonalFamily(
  "shinyRare",
  "shinyRareCoat",
  FOIL_FLAT,
  [0.4, 0.4],
  [0.8, 0.4],
  "exclusion",
);

const [shinyV, shinyVCoat] = diagonalFamily(
  "shinyV",
  "shinyVCoat",
  FOIL_FLAT,
  [0.35, 0.4],
  [0.7, 0.4],
  "exclusion",
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

const [exFullArt, exFullArtCoat] = diagonalFamily(
  "exFullArt",
  "exFullArtCoat",
  FOIL,
  [0.5, 0.4],
  [0.5, 0.4],
  "exclusion",
);

const [illustrationRare, illustrationRareCoat] = diagonalFamily(
  "illustrationRare",
  "illustrationRareCoat",
  GRAIN,
  [0.8, 0.15],
  [1, 0.2],
  "soft-light",
  "screen, hue, hard-light",
);

const [hyperRare, hyperRareCoat] = diagonalFamily(
  "hyperRare",
  "hyperRareCoat",
  FOIL_GOLD,
  [0.6, 0.2],
  [0.75, 0.2],
  "hard-light",
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

  rainbowHolo: L("rainbowHolo", {
    backgroundImage: `linear-gradient(-45deg, ${R1}, ${R5}), ${GLITTER}, linear-gradient(-30deg, ${RAINBOW})`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: `200% 200%, ${GSIZE} ${GSIZE}, 400% 400%`,
    backgroundPosition: `calc(25% + (50% * ${PL})) calc(25% + (50% * ${PT})), center, calc(25% + (${PX} / 2)) calc(25% + (${PY} / 2))`,
    backgroundBlendMode: "luminosity, soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.6, 0.25)} contrast(2.2) saturate(0.75)`,
    pointerFalloff: false,
    overlay: "rainbowHoloCoat",
  }),

  rainbowHoloCoat: L("rainbowHoloCoat", {
    backgroundImage: `${GLITTER}, linear-gradient(-60deg, ${RAINBOW})`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, 400% 400%`,
    backgroundPosition: `center, ${PX} ${PY}`,
    backgroundBlendMode: "soft-light",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.55, 0.3)} contrast(2) saturate(1)`,
    pointerFalloff: false,
  }),

  rainbowAlt: L("rainbowAlt", {
    backgroundImage: `repeating-linear-gradient(var(--angle, -22deg), hsla(283, 49%, 60%, 0.75) calc(var(--space, 5%) * 1), hsla(2, 70%, 58%, 0.75) calc(var(--space, 5%) * 2), hsla(53, 67%, 53%, 0.75) calc(var(--space, 5%) * 3), hsla(93, 56%, 52%, 0.75) calc(var(--space, 5%) * 4), hsla(176, 38%, 50%, 0.75) calc(var(--space, 5%) * 5), hsla(228, 100%, 77%, 0.75) calc(var(--space, 5%) * 6), hsla(283, 49%, 61%, 0.75) calc(var(--space, 5%) * 7)), ${GLITTER}, linear-gradient(-30deg, ${RAINBOW})`,
    backgroundRepeat: "no-repeat, repeat, no-repeat",
    backgroundSize: `200% 400%, ${GSIZE} ${GSIZE}, 400% 400%`,
    backgroundPosition: `0% ${BY}, center, calc(${BX} * 1.5) calc(${BY} * 1.5)`,
    backgroundBlendMode: "luminosity, overlay",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.3, 0.3)} contrast(3) saturate(1.8)`,
    pointerFalloff: false,
    overlay: "rainbowAltCoat",
  }),

  rainbowAltCoat: L("rainbowAltCoat", {
    backgroundImage: `${GLITTER}, linear-gradient(-60deg, ${RAINBOW})`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, 400% 400%`,
    backgroundPosition: `center, calc(${BX} * -1.5) calc(${BY} * -1.5)`,
    backgroundBlendMode: "overlay",
    mixBlendMode: "color-dodge",
    opacity: 0.85,
    filter: `${brightFrom(0.6, 0.5)} contrast(3) saturate(1)`,
    pointerFalloff: false,
  }),

  cosmosHolo: L("cosmosHolo", {
    backgroundImage: `${COSMOS}, ${COSMOS_BANDS}, radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(180, 100%, 89%, 0.5) 5%, hsla(180, 14%, 57%, 0.3) 40%, hsl(0, 0%, 0%) 130%)`,
    backgroundRepeat: "repeat, no-repeat, no-repeat",
    backgroundSize: "cover, 400% 900%, cover",
    backgroundPosition: `center, calc(10% + (${PL} * 80%)) calc(10% + (${PT} * 80%)), center`,
    backgroundBlendMode: "color-burn, multiply",
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
    backgroundImage: `${CLOUD}, ${COSMOS_BANDS}`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "cover, 400% 900%",
    backgroundPosition: `center, calc(15% + (${PL} * 70%)) calc(15% + (${PT} * 70%))`,
    backgroundBlendMode: "lighten, multiply",
    mixBlendMode: "overlay",
    opacity: 0.9,
    filter: `brightness(${lit(1.25, 0.1)}) contrast(${lit(1.75, 0.15)}) saturate(0.8)`,
    pointerFalloff: false,
  }),

  amazingRare: L("amazingRare", {
    backgroundImage: `${GLITTER_GOLD}, ${GLITTER_GOLD}, radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(150, 20%, 10%, 1) 10%, hsla(177, 22%, 80%, 0.1) 50%, hsla(0, 0%, 95%, 0.98) 90%)`,
    backgroundRepeat: "repeat, repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, ${GSIZE} ${GSIZE}, cover`,
    backgroundPosition: "40% 45%, 55% 55%, center",
    backgroundBlendMode: "soft-light, color-burn",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `brightness(${lit(1, 0.15)}) contrast(1) saturate(0.9)`,
    pointerFalloff: false,
    overlay: "amazingRareCoat",
  }),

  amazingRareCoat: L("amazingRareCoat", {
    backgroundImage: sunpillar("var(--angle, 133deg)"),
    backgroundRepeat: "no-repeat",
    backgroundSize: "400% 800%",
    backgroundPosition: `calc(50% + (50% - ${BX}) * 3) calc(50% + (50% - ${BY}) * 3)`,
    mixBlendMode: "saturation",
    opacity: 0.85,
    filter: `brightness(calc(0.75 - (${OFF} * 0.5))) contrast(1) saturate(1)`,
    pointerFalloff: false,
  }),

  secretRare: L("secretRare", {
    backgroundImage: `${GLITTER_GOLD}, ${GLITTER_GOLD}, conic-gradient(${SP4}, ${SP5}, ${SP6}, ${SP1}, ${SP4}), radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(150, 0%, 0%, 0.98) 10%, hsla(0, 0%, 95%, 0.15) 90%)`,
    backgroundRepeat: "repeat, repeat, no-repeat, no-repeat",
    backgroundSize: `${GSIZE} ${GSIZE}, ${GSIZE} ${GSIZE}, cover, cover`,
    backgroundPosition: "45% 45%, 55% 55%, center, center",
    backgroundBlendMode: "soft-light, hard-light, overlay",
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.4, 0.2)} contrast(1) saturate(2.7)`,
    pointerFalloff: false,
    overlay: "secretRareCoat",
  }),

  secretRareCoat: L("secretRareCoat", {
    backgroundImage: `${FOIL_GOLD}, linear-gradient(45deg, hsl(46, 95%, 50%), hsl(52, 100%, 69%)), radial-gradient(farthest-corner circle at ${PX} ${PY}, hsla(10, 20%, 90%, 0.95) 10%, hsl(0, 0%, 0%) 70%)`,
    backgroundRepeat: "no-repeat, no-repeat, no-repeat",
    backgroundSize: "cover, cover, cover",
    backgroundPosition: "center, center, center",
    backgroundBlendMode: "hard-light, multiply",
    mixBlendMode: "lighten",
    opacity: 0.8,
    filter: `brightness(${lit(1.25, 0.1)}) contrast(1.25) saturate(0.35)`,
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

  trainerGalleryHolo: L("trainerGalleryHolo", {
    backgroundImage: `repeating-linear-gradient(var(--angle, -22deg), hsla(283, 49%, 60%, 0.75) calc(var(--space, 5%) * 1), hsla(2, 74%, 59%, 0.75) calc(var(--space, 5%) * 2), hsla(53, 67%, 53%, 0.75) calc(var(--space, 5%) * 3), hsla(93, 56%, 52%, 0.75) calc(var(--space, 5%) * 4), hsla(176, 38%, 50%, 0.75) calc(var(--space, 5%) * 5), hsla(228, 100%, 77%, 0.75) calc(var(--space, 5%) * 6), hsla(283, 49%, 61%, 0.75) calc(var(--space, 5%) * 7))`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "300% 400%",
    backgroundPosition: `0% ${BY}`,
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `${brightFrom(0.5, 0.3)} contrast(2.3) saturate(1)`,
    pointerFalloff: false,
    overlay: "trainerGalleryHoloCoat",
  }),

  trainerGalleryHoloCoat: L("trainerGalleryHoloCoat", {
    backgroundImage: `radial-gradient(farthest-corner ellipse at calc((${PX} * 0.5) + 25%) calc((${PY} * 0.5) + 25%), hsl(0, 0%, 95%) 10%, hsl(0, 0%, 20%) 90%)`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "400% 500%",
    backgroundPosition: "center",
    mixBlendMode: "hard-light",
    opacity: 0.85,
    filter: `${brightFrom(0.4, 0.2)} contrast(0.85) saturate(1.1)`,
    pointerFalloff: false,
  }),

  pokeBallHolo: L("pokeBallHolo", {
    backgroundImage: `linear-gradient(45deg, hsla(0, 0%, 40%) 15%, hsla(0, 0%, 20%) 45%, hsla(0, 0%, 20%) 55%, hsla(0, 0%, 40%) 85%)`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "200% 200%",
    backgroundPosition: `${PX} ${PY}`,
    mixBlendMode: "color-dodge",
    opacity: 1,
    filter: `brightness(${lit(0.75, 0.15)}) contrast(1) saturate(1)`,
    pointerFalloff: false,
    overlay: "pokeBallHoloCoat",
    carve: { url: `${T}/TEX_CC_PB.webp`, size: "190px 190px", repeat: "repeat" },
  }),

  pokeBallHoloCoat: L("pokeBallHoloCoat", {
    backgroundImage: `linear-gradient(45deg, ${SP4}, ${SP5}, ${SP6}, ${SP1}, ${SP2}, ${SP3}, ${SP4}, ${SP5}, ${SP6}, ${SP1}, ${SP2}, ${SP3}, ${SP4})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "200% 200%",
    backgroundPosition: `${PX} ${PY}`,
    mixBlendMode: "lighten",
    opacity: 0.85,
    filter: `brightness(${lit(0.55, 0.2)}) contrast(1.8) saturate(calc(${OFF} * 1.1 + 0.3))`,
    pointerFalloff: false,
  }),

  exRegular,
  exRegularCoat,
  exFullArt,
  exFullArtCoat,
  illustrationRare,
  illustrationRareCoat,
  hyperRare,
  hyperRareCoat,
};

export function simeyHoloShader(id: SimeyHoloShaderId): HoloShader {
  return SIMEY_SHADERS[id];
}
