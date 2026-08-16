import type { HoloShader, MaskLayer } from "@/core/render/holoShaders";

/**
 * Opacity ceilings after Radiant washout + the stacked glare / etch coats.
 *
 * `color-dodge` multiplies highlight; anything above ~0.5 bleaches pale art
 * (Radiant at 0.8 erased the illustration). Everyday `overlay`/`screen` sits
 * under the pointer light mask, plate glare and etch — first-jet 0.7–0.8
 * values read as a milky sheet once those layers shipped.
 */
export const POKEMON_CSS_OPACITY_CEILING = 0.58;
/** Harder ceiling when the stack meets the art with `color-dodge`. */
export const POKEMON_CSS_DODGE_OPACITY_CEILING = 0.5;

/**
 * Pokémon looks built from the pack's **own** foil textures.
 *
 * Not invented, and not borrowed: `data/pokemon/foil/textures/` holds ~70
 * FX textures extracted from the publisher's app — the same kind of asset the
 * Lorcana recipes are transcribed against, and the exact ones each Unity
 * material binds. The house gradients in `holoShadersHouse` were a stand-in for
 * these while nobody had looked at what the extract already contained.
 *
 * Every recipe below is read off `SHARED_BY_FOIL` in `effects/pokemon/materials`
 * — the slot→texture map dumped from the materials themselves. Nothing here is
 * chosen by eye: if a look binds `FX_T_Spectrum_Sunbeam`, that is because its
 * material does.
 *
 * ## The shape of a look
 *
 * Reading the materials, a finish is three things stacked, and the recipes say
 * so in that order:
 *
 * - a **spectrum** — a 1D hue ramp, stretched across the card and travelled with
 *   `--background-x/y` (compressed motif scroll). This is what makes colour
 *   *move* rather than merely exist.
 * - a **shine** — a broad specular band, travelled at *half* the spectrum's rate
 *   so the two separate as the card turns. That rate difference is the parallax;
 *   it costs nothing and is most of what reads as depth.
 * - a **tooth** — glitter, stars, confetti, bars: tiled small and held still,
 *   so it belongs to the card rather than sliding across it.
 *
 * ## What is deliberately left out
 *
 * Two kinds of texture in the map are *data*, not pictures, and drawing them
 * would be a bug rather than a shortcut:
 *
 * - **displacement** (`FX_T_Distort`, `T_Holofoil_Distortion_*`) — these offset
 *   UVs in the fragment shader. CSS has no equivalent, and the recipes omit
 *   them rather than fake them. This is the honest ceiling of the fallback and
 *   the main reason WebGL still looks better on the ultra-rares.
 * - **direction / normal maps** (`T_Direction_*`, `T_Normal_*`, the `_RG_`
 *   masks) — red/green vector fields. Painted onto a card they read as garish
 *   red-green noise, because that is what they are.
 *
 * What survives that cut is 44 files across five families, which is why 26
 * materials need far fewer distinct ideas than they have names.
 */

/** Where the extracted FX textures are served from. */
const T = "/assets/pokemon/textures";

/**
 * How a layer moves under the pointer.
 *
 * `scroll` and `drift` differ only by rate, and that difference is the point:
 * two layers travelling together are one layer.
 */
type Motion =
  /** The spectrum: full rate. */
  | "scroll"
  /** A spectrum stored as a *tall* strip, so it must travel down instead. */
  | "scrollY"
  /** Simey `0% var(--background-y)` spectrum pan (diagonalFamily). */
  | "scrollYEdge"
  /** The shine: half rate, so it separates from the spectrum. */
  | "drift"
  /** The half-rate counterpart for a tall strip. */
  | "driftY"
  /**
   * Travels *against* the pointer.
   *
   * Two layers moving the same way at different speeds separate; two moving in
   * opposite directions shear past each other, which is what sells depth. The
   * reference implementations lean on this heavily and it costs nothing.
   */
  | "counter"
  | "counterY"
  /** Tooth and plates: fixed to the card. */
  | "still"
  /** Follows the pointer directly, for sheens that behave like a highlight. */
  | "lean"
  /**
   * Radiant lattice pan — FPTI dosage (gentler than simey ×1.5):
   * `calc(((background - 50%) * 0.9) + 50%)` on both axes.
   * poke-holo uses ×1.5 / 210%; Live etch + full-weight dodge washed art, so
   * we adopt the quieter pan from juhee FPTI's RadiantHolo port.
   */
  | "radiantPan"
  /** Radiant rainbow coat: opposite pan at ×−2.5 (simey / FPTI coat). */
  | "radiantCoat"
  /** Opposite-pan coat (simey rainbow-alt / V :after) — mild. */
  | "opposite"
  /** Strong opposite pan (simey ×−1.5). */
  | "oppositeStrong"
  /** poke-151 ex-full-art rib pan: `bx + by*0.2`. */
  | "shear"
  /** Coat: negated shear. */
  | "shearOpposite";

const POSITION: Record<Motion, string> = {
  // Motif travel uses compressed `--background-x/y` (simey technique: glare
  // on raw pointer, motifs on a narrowed range so oversized layers never show
  // a box-edge join). Fallbacks keep the first paint valid before idle runs.
  // Drift is half-rate via `/ 2` — never `* 0.5` on a `%` custom prop (some
  // engines reject it and drop the whole `background-position`).
  scroll: "var(--background-x, 50%) center",
  scrollY: "center var(--background-y, 50%)",
  /** Simey diagonalFamily spectrum: `0% var(--background-y)`. */
  scrollYEdge: "0% var(--background-y, 50%)",
  drift: "calc(var(--background-x, 50%) / 2 + 25%) center",
  driftY: "center calc(var(--background-y, 50%) / 2 + 25%)",
  counter: "calc(100% - var(--background-x, 50%)) center",
  counterY: "center calc(100% - var(--background-y, 50%))",
  still: "center",
  lean: "var(--colorX) var(--colorY)",
  radiantPan:
    "calc(((var(--background-x, 50%) - 50%) * 0.9) + 50%) calc(((var(--background-y, 50%) - 50%) * 0.9) + 50%)",
  radiantCoat:
    "calc(((var(--background-x, 50%) - 50%) * -2.5) + 50%) calc(((var(--background-y, 50%) - 50%) * -2.5) + 50%)",
  opposite:
    "calc(100% - var(--background-x, 50%)) calc(100% - var(--background-y, 50%))",
  oppositeStrong:
    "calc(((var(--background-x, 50%) - 50%) * -1.5) + 50%) calc(((var(--background-y, 50%) - 50%) * -1.5) + 50%)",
  shear:
    "calc(var(--background-x, 50%) + (var(--background-y, 50%) * 0.2)) var(--background-y, 50%)",
  shearOpposite:
    "calc(0% - (var(--background-x, 50%) + (var(--background-y, 50%) * 0.2))) calc(0% - var(--background-y, 50%))",
};

type Layer = {
  /** File stem under `textures/`, without extension. */
  tex?: string;
  /** A CSS `<image>` written out in full — used for the banding gradients. */
  raw?: string;
  size: string;
  motion: Motion;
  repeat?: string;
};

function layerImage(l: Layer): string {
  return l.raw ?? `url(${T}/${l.tex}.webp)`;
}

/*
  ── Palettes ───────────────────────────────────────────────────────────────

  Sampled from the extract, not picked by eye. Each row is eight even stops
  read straight off the publisher's own ramp, along whichever axis that ramp
  varies on:

    sharp(tex).resize(1, 8)  // tall strips
    sharp(tex).resize(8, 1)  // wide strips

  This is the part worth keeping from the textures. The plates themselves are
  *fragment-shader inputs* — Unity distorts them, lights them and modulates
  them by view angle, so dropped raw into a `background-image` they read flat.
  Their colours, though, are the real thing, and a CSS gradient built on them
  bands the way the print does while still being tunable like a CSS look.
*/

/** `FX_T_Spectrum_SVHolo2` — the Scarlet & Violet rainbow. */
const SV_SPECTRUM = [
  "#c10b40",
  "#d00e1b",
  "#ec6506",
  "#bbc31f",
  "#32cf68",
  "#1f97d3",
  "#372ec5",
  "#9c25bd",
];

/**
 * `FX_T_Spectrum_SVHolo3` — the cool counter-ramp.
 *
 * Indigo → steel → sand → rust → plum. Running this against `SV_SPECTRUM` at a
 * different rate is what gives an SV card its shifting duality; one ramp alone
 * reads as a sticker.
 */
const SV_COUNTER = [
  "#21116b",
  "#2922a8",
  "#3d58c5",
  "#769dcc",
  "#c1b5aa",
  "#995144",
  "#7a243e",
  "#440f54",
];

/** `FX_T_Spectrum_FlatSilver` — the reverse-holo silver, with its green cast. */
const _FLAT_SILVER = [
  "#3f3835",
  "#393b3a",
  "#38453c",
  "#5a7c1f",
  "#3ac608",
  "#02a564",
  "#0c78a9",
  "#424641",
];

/**
 * `FX_T_Highlight_Gold_Band`, measured: eight samples between `#553f25` and
 * `#5c452b`. It is a flat warm slab, not a picture — so it belongs as a *tint*
 * over the spectrum, never as the layer carrying the drawing.
 */
const GOLD_TINT = "#5a4326";

/**
 * Bands built from a sampled palette.
 *
 * `repeating-linear-gradient` is what lets a CSS look reach the layer count the
 * effect actually needs — the reference implementations stack dozens of these,
 * where a texture costs a request and a fixed resolution. `period` is in
 * percent of the gradient box, so a small period gives the fine hatch and a
 * large one the broad sweep.
 */
function bands(
  palette: readonly string[],
  angle: number,
  period: number,
): string {
  const step = period / palette.length;
  const stops = palette
    .map((c, i) => `${c} ${(i * step).toFixed(2)}%`)
    .concat(`${palette[0]} ${period.toFixed(2)}%`)
    .join(", ");
  return `repeating-linear-gradient(${angle}deg, ${stops})`;
}

/*
  ── Simey choreography (structure only) ───────────────────────────────────

  Borrowed from vendored poke-holo / poke-151 CSS. Paint stays Live plates;
  these gradients are the layers Live frags don't expose as drawables
  (pastel band lattices, V diagonal ribs, reverse laminate light masks).
*/

/** poke-holo `rainbow-alt.css` lead bands. */
const RAINBOW_ALT_BANDS = `repeating-linear-gradient(var(--angle, -22deg), hsla(283, 49%, 60%, 0.75) calc(var(--space, 5%) * 1), hsla(2, 70%, 58%, 0.75) calc(var(--space, 5%) * 2), hsla(53, 67%, 53%, 0.75) calc(var(--space, 5%) * 3), hsla(93, 56%, 52%, 0.75) calc(var(--space, 5%) * 4), hsla(176, 38%, 50%, 0.75) calc(var(--space, 5%) * 5), hsla(228, 100%, 77%, 0.75) calc(var(--space, 5%) * 6), hsla(283, 49%, 61%, 0.75) calc(var(--space, 5%) * 7))`;

const RAINBOW_PASTEL =
  "hsl(0, 57%, 37%), hsl(40, 53%, 39%), hsl(90, 60%, 35%), hsl(180, 60%, 35%), hsl(180, 60%, 35%), hsl(210, 57%, 39%), hsl(280, 55%, 31%), hsl(0, 57%, 37%), hsl(40, 53%, 39%), hsl(90, 60%, 35%), hsl(180, 60%, 35%), hsl(180, 60%, 35%), hsl(210, 57%, 39%), hsl(280, 55%, 31%), hsl(0, 57%, 37%)";

/** poke-holo cosmos 82° lattice (EN PNGs replaced by Live Bright spectrum). */
const COSMOS_BANDS = `repeating-linear-gradient(82deg, hsl(53, 65%, 60%) calc(var(--space, 4%) * 1), hsl(93, 56%, 50%) calc(var(--space, 4%) * 2), hsl(176, 54%, 49%) calc(var(--space, 4%) * 3), hsl(228, 59%, 55%) calc(var(--space, 4%) * 4), hsl(283, 60%, 55%) calc(var(--space, 4%) * 5), hsl(326, 59%, 51%) calc(var(--space, 4%) * 6), hsl(326, 59%, 51%) calc(var(--space, 4%) * 7), hsl(283, 60%, 55%) calc(var(--space, 4%) * 8), hsl(228, 59%, 55%) calc(var(--space, 4%) * 9), hsl(176, 54%, 49%) calc(var(--space, 4%) * 10), hsl(93, 56%, 50%) calc(var(--space, 4%) * 11), hsl(53, 65%, 60%) calc(var(--space, 4%) * 12))`;

/** V-family diagonal ribs (`v-*.css`) — px period so they may `repeat`. */
function vRibs(angle = "133deg"): string {
  return `repeating-linear-gradient(${angle}, #0e152e 0px, hsl(180, 10%, 60%) 4px, hsl(180, 29%, 66%) 5px, hsl(180, 10%, 60%) 6px, #0e152e 12px, #0e152e 14px)`;
}

/**
 * Live `FX_T_Spectrum_Sunpillar` hues as a CSS repeating ramp. poke-151
 * `ex-regular` uses 0° (shine) / `--angle` 133° (glitter); Live frag rotates
 * the plate in UV — CSS rebuilds the period from dump samples instead.
 * Oversized `no-repeat` (no tile seam).
 *
 * Dump samples are darkened for CSS soft-light: raw mid stops (`#c1c96e`,
 * `#82ccd4`) still lift Live art toward milk when soft-lit at playroom dose.
 */
function liveSunPillarBands(angle: string): string {
  const sampled = [
    "#370e58",
    "#70153e",
    "#ab4837",
    "#c1c96e",
    "#82ccd4",
    "#3d4dd1",
    "#271f9a",
    "#2f0e58",
  ].map(liveSunPillarCssDim);
  const step = 12.5; // % of the gradient period
  const stops = sampled.map((col, i) => `${col} ${i * step}%`);
  stops.push(`${sampled[0]} ${sampled.length * step}%`);
  return `repeating-linear-gradient(${angle}, ${stops.join(", ")})`;
}

/** Keep hue; pull luma down so soft-light does not milk dark Live art. */
function liveSunPillarCssDim(hex: string): string {
  const n = hex.replace("#", "");
  const to = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v * 0.45)))
      .toString(16)
      .padStart(2, "0");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * poke-151 `ex-regular` structural ribs (133°). Colour comes from the Live
 * spectrum layer; these ribs are the tooth that sells sun-pillars.
 * Highlights stay mid (not Simey's L≈82%) — on dark Live art, bright ribs
 * + color-dodge/lighten milk the plate grey-white.
 */
function sunPillarRibs(): string {
  return `repeating-linear-gradient(133deg, #0e1221 0%, hsl(180, 18%, 28%) 2.8%, hsl(180, 35%, 42%) 3.5%, hsl(180, 18%, 28%) 4.2%, #0e1221 7%, #0e1221 12%)`;
}

/** Simey ex-regular glitter radial (pointer-linked dank falloff). */
function sunPillarGlitterSpot(): string {
  return `radial-gradient(farthest-corner circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), hsl(295, 100%, 10%) 20%, hsla(183, 84%, 85%, 0.15) 100%)`;
}

/**
 * poke-151 `ex-full-art` / Simey `vBars` ribs at 128.5°.
 * %-period is OK: single oversized `no-repeat` plate (Simey sizes 300%/195%)
 * — never `background-repeat` a diagonal lattice.
 */
function angledExRibs(): string {
  return `repeating-linear-gradient(128.5deg, #0e152e 0%, hsl(180, 10%, 60%) 3.8%, hsl(180, 29%, 66%) 4.5%, hsl(180, 10%, 60%) 5.2%, #0e152e 14%, #0e152e 16%)`;
}

/** Simey V / ex pointer shade. */
function pillarSpot(): string {
  return `radial-gradient(farthest-corner circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), hsla(0, 0%, 0%, 0.1) 12%, hsla(0, 0%, 0%, 0.15) 20%, hsla(0, 0%, 0%, 0.25) 120%)`;
}

/** Amazing-rare inverted radial (dark core → bright rim). */
function galaxyInvertSpot(): string {
  return `radial-gradient(farthest-corner circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), hsla(150, 20%, 10%, 1) 10%, hsla(177, 22%, 80%, 0.1) 50%, hsla(0, 0%, 95%, 0.98) 90%)`;
}

/** Reverse-holo laminate light masks (`reverse-holo.css`). */
function reverseRadial(): string {
  return `radial-gradient(circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), #fff 5%, #000 50%, #fff 80%)`;
}

function reverseDiagonal(): string {
  return `linear-gradient(-45deg, #000 15%, #fff, #000 85%)`;
}

/** Poké Ball base grey laminate (`poke-ball-holo.css` .card__shine). */
function pokeBallLaminate(): string {
  return `linear-gradient(45deg, hsla(0, 0%, 40%) 15%, hsla(0, 0%, 20%) 45%, hsla(0, 0%, 20%) 55%, hsla(0, 0%, 40%) 85%)`;
}

function cosmosSpot(): string {
  return `radial-gradient(farthest-corner circle at var(--pointer-x, var(--colorX, 50%)) var(--pointer-y, var(--colorY, 50%)), hsla(180, 100%, 89%, 0.5) 5%, hsla(180, 14%, 57%, 0.3) 40%, hsl(0, 0%, 0%) 130%)`;
}

/** A soft white sweep that reads as the specular highlight. */
function sweep(angle: number, width = 22): string {
  return `linear-gradient(${angle}deg, rgba(255,255,255,0) ${50 - width}%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) ${50 + width}%)`;
}

/**
 * Specular glare — one lobe that slides with the pointer.
 *
 * Must be `no-repeat`: `band()` defaults to `repeat`, and tiling a single
 * soft lobe shows the tile edge as a hard join. Simey's `.card__glare` does
 * the same: large `background-size`, `no-repeat`. Motions ride compressed
 * `--background-x/y` so the lobe stays on-card.
 */
function glare(angle: number, size: string, motion: Motion, width = 22): Layer {
  return {
    raw: sweep(angle, width),
    size,
    motion,
    repeat: "no-repeat",
  };
}

/** A hue ramp, stretched wide so it bands instead of smearing. */
function spectrum(tex: string, size = "220% 100%"): Layer {
  // Finite texture: `repeat` keeps the card covered while the compressed
  // `--background-x` window scrolls across an oversized plate.
  return { tex, size, motion: "scroll", repeat: "repeat" };
}

/**
 * A hue ramp stored as a *tall* strip rather than a wide one.
 *
 * `FX_T_Spectrum_SVHolo2` and `SVHolo3` are 32×256: the colour varies down the
 * texture, not across it. Scrolling those horizontally moves a ramp along the
 * axis it is constant on, so the hue never changed — the layer was there, lit,
 * filtered, and completely static.
 */
function spectrumTall(tex: string, size = "100% 220%"): Layer {
  return { tex, size, motion: "scrollY", repeat: "repeat" };
}

/** A specular band, deliberately at half the spectrum's rate. */
function shine(tex: string, size = "200% 200%"): Layer {
  return { tex, size, motion: "drift", repeat: "no-repeat" };
}

/**
 * The perpendicular partner of a shine, travelling on the other axis.
 *
 * A Radiant's signature is a cross-hatched iridescence, and the material says
 * where it comes from: `T_Holofoil_Mask_RadiantHolo_RG_X_Grad_5` is a red/green
 * vector field — red carries the horizontal gradient, green the vertical — that
 * the fragment shader uses to modulate along both axes at once. CSS cannot
 * sample a vector field, but it does not have to: the extract ships the pair
 * already rotated (`FX_T_Gradient_Shine` is 1024×128, `_Rotate_90` is 128×1024).
 * Crossing them reproduces the grid from the publisher's own plates.
 */
function crossShine(tex: string, size = "200% 200%"): Layer {
  return { tex, size, motion: "driftY", repeat: "no-repeat" };
}

/** The lozenge ramp — upstream's stops, verbatim (`radiant-holo.css`). */
const RADIANT_BAR_STEPS = [10, 20, 35, 42.5, 50, 42.5, 35, 20, 10, 0] as const;

/** `--barwidth` with the vendored default, spelled once. */
const BARW = "var(--barwidth, 1.2%)";

function radiantBars(angle: 45 | -45): string {
  const grey = (l: number) => `hsl(0,0%,${l}%)`;
  const head = RADIANT_BAR_STEPS[0];
  const stops = [
    `${grey(head)} 0%`,
    `${grey(head)} 1%`,
    `${grey(head)} ${BARW}`,
  ];
  for (let i = 1; i < RADIANT_BAR_STEPS.length; i++) {
    const l = grey(RADIANT_BAR_STEPS[i]!);
    // Hard edge: the +0.01% keeps each band flat instead of ramping into the
    // next. Stops must stay ascending — a non-ascending ramp once flattened the
    // hatch entirely in the browser.
    stops.push(
      `${l} calc(${BARW} * ${i} + 0.01%)`,
      `${l} calc(${BARW} * ${i + 1})`,
    );
  }
  return `repeating-linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

/**
 * The spotlight as the lattice's **first layer** — poke-holo `.card__shine`
 * layer 1 (`hsl(0,0%,95%)` → `--card-glow`), **always lit**.
 *
 * `exclusion` against this bright disc is what turns the ±45° gray bars into a
 * readable color-dodge lattice. Fading the spot with glare `--opacity` (idle
 * pins it to 0, and the pointer spring keeps writing that) collapses the bars
 * to near-black → color-dodge becomes a no-op. Glare still rides `--opacity`
 * on `.card__glare` in `HoloCardImage`; do not gate the lattice spot on it.
 */
function radiantSpotInLattice(): string {
  const at = `calc(((var(--pointer-x, var(--colorX, 50%))) * 0.5) + 25%) calc(((var(--pointer-y, var(--colorY, 50%))) * 0.5) + 25%)`;
  return `radial-gradient(farthest-corner ellipse at ${at}, hsl(0, 0%, 95%) 20%, var(--card-glow, hsl(175, 100%, 90%)) 130%)`;
}

/**
 * Simey `.card__shine:after` pastel wash (`--space: 200px`, 55deg).
 * Hue source stays CSS — Live spectrum plates are fragment inputs, not this wash.
 */
function radiantRainbow(): string {
  return `repeating-linear-gradient(55deg, hsl(3, 95%, 85%) calc(var(--space, 200px) * 1), hsl(207, 100%, 84%) calc(var(--space, 200px) * 2), hsl(29, 100%, 85%) calc(var(--space, 200px) * 3), hsl(160, 100%, 86%) calc(var(--space, 200px) * 4), hsl(309, 94%, 87%) calc(var(--space, 200px) * 5), hsl(188, 95%, 85%) calc(var(--space, 200px) * 6), hsl(3, 95%, 85%) calc(var(--space, 200px) * 7))`;
}

/**
 * Live `_CardEtch` as simey's `var(--foil)`.
 *
 * Measured same print 732×1024 (e.g. FR Radiant Charizard):
 *   poke-holo etched foil (EN scan) ≈ luminance 26 (light lines on black)
 *   Live etch (same locale as art)  ≈ luminance 196 (dark lines on white)
 *
 * Polarity is corrected **before** this custom property is set
 * (`useInvertedPaintBlob` in `HoloCardImage`). Content stays the Live
 * engraving — fingerprint waves, not Simey's EN line-art bake. The coat
 * then uses the same layer order as upstream: foil on top of the pastel
 * rainbow, `hard-light`.
 */
function radiantFoilLayer(): string {
  return `var(--foil-etch, linear-gradient(hsl(0, 0%, 8%), hsl(0, 0%, 14%)))`;
}

/** A gradient layer: banding, hatch or sweep. */
function band(image: string, size: string, motion: Motion): Layer {
  // `repeating-linear-gradient` already tiles *inside* its box. An outer
  // `background-repeat: repeat` on an oversized box (180%…) draws a hard join
  // when the scroll window crosses a tile — the vertical seam on
  // SvUltraGoldRainbow. Pan one big box instead (simey / CodePen pattern).
  return { raw: image, size, motion, repeat: "no-repeat" };
}

/** Glitter, stars, confetti — tiled small and pinned to the card. */
function tooth(tex: string, size = "180px 180px"): Layer {
  return { tex, size, motion: "still", repeat: "repeat" };
}

/** A full-card plate: bars, a light sheen — things that are genuinely drawn. */
function plate(tex: string, size = "100% 100%"): Layer {
  return { tex, size, motion: "still", repeat: "no-repeat" };
}

/**
 * A stencil that cuts the finish into shapes instead of being painted with it.
 *
 * Five plates in the extract measure near-black with the shape held in alpha —
 * cosmos dots (luminance 0), galaxy stars (1), cracked ice (9), Northern Cross
 * (13), the Poké Ball laminate (28). Drawn as layers they can only darken the
 * card, which is exactly what they were doing. See `HoloShader.carve`.
 */
function carve(tex: string, size: string): MaskLayer {
  return { url: `${T}/${tex}.webp`, size, repeat: "repeat" };
}

type Tuning = {
  /** How the layers blend against each other, innermost pair first. */
  blend: string;
  /** How the finished stack meets the artwork. */
  mix: string;
  opacity: number;
  /** `[at rest, added at full lean]` — the card must answer the light. */
  contrast?: [number, number];
  saturate?: [number, number];
  brightness?: [number, number];
  /** A stencil this finish is cut by; see `carve`. */
  carve?: MaskLayer;
  /** When false, keep the lattice full-card (no pointer radial mask). */
  pointerFalloff?: boolean;
};

const OFF_CENTRE = "var(--pointer-from-center, 0)";

/**
 * A filter term that grows as the pointer leaves the centre.
 *
 * The fallback in `var(--pointer-from-center, 0)` is load-bearing: the property
 * is written to the DOM node on the first animation frame, and a `calc()` with
 * no fallback resolves to nothing before then — silently dropping the *whole*
 * filter, not just the term.
 */
function lit(base: number, swing: number): string {
  return `calc(${base} + ${OFF_CENTRE} * ${swing})`;
}

function look(
  id: PokemonHoloShaderId,
  layers: readonly Layer[],
  tuning: Tuning,
): HoloShader {
  // Simey / photography order: exposure first, then contrast, then saturate.
  // Contrast-before-brightness on a hot radial (Radiant) blows color-dodge white.
  const filters: string[] = [];
  if (tuning.brightness)
    filters.push(`brightness(${lit(...tuning.brightness)})`);
  if (tuning.contrast) filters.push(`contrast(${lit(...tuning.contrast)})`);
  if (tuning.saturate) filters.push(`saturate(${lit(...tuning.saturate)})`);

  return {
    id,
    backgroundImage: layers.map(layerImage).join(", "),
    backgroundRepeat: layers.map((l) => l.repeat ?? "repeat").join(", "),
    backgroundSize: layers.map((l) => l.size).join(", "),
    backgroundPosition: layers.map((l) => POSITION[l.motion]).join(", "),
    backgroundBlendMode: tuning.blend,
    mixBlendMode: tuning.mix,
    opacity: tuning.opacity,
    filter: filters.length ? filters.join(" ") : undefined,
    ...(tuning.carve ? { carve: tuning.carve } : {}),
    ...(tuning.pointerFalloff === false ? { pointerFalloff: false } : {}),
  };
}

export const POKEMON_HOLO_SHADER_IDS = [
  "ultraGoldRainbow",
  "ultraGoldRainbowCoat",
  "ultraGoldRainbowEtch",
  "ultraScodix",
  "swSecret",
  "swSecretCoat",
  "swSecretEtch",
  "svUltra",
  "svUltraCoat",
  "svHolo",
  "svHoloCoat",
  "swHolo",
  "swHoloCoat",
  "cosmos",
  "cosmosCoat",
  "cosmosTop",
  "galaxy",
  "galaxyCoat",
  "crackedIce",
  "crackedIceCoat",
  "rainbowFoil",
  "rainbowFoilCoat",
  "rainbow02",
  "rainbow02Coat",
  "sunPillar",
  "sunPillarCoat",
  "sunPillarGlitter",
  "sunPillarCc",
  "sunPillarCcCoat",
  "sunPillarCcGlitter",
  "sunBeam",
  "sunLava",
  "flatSilver",
  "flatSilverCoat",
  "flatSilverCc",
  "flatSilverCcMb",
  "solidColor",
  "squares",
  "thatch",
  "tinsel",
  "radiantHolo",
  "radiantHoloCoat",
  "radiantHoloSparkle",
  "aceFoil",
  "aceFoilCoat",
  "angledPillars",
  "angledPillarsCoat",
  "stamped",
  "confetti25th",
] as const;

export type PokemonHoloShaderId = (typeof POKEMON_HOLO_SHADER_IDS)[number];

export function isPokemonHoloShaderId(
  value: unknown,
): value is PokemonHoloShaderId {
  return (
    typeof value === "string" &&
    (POKEMON_HOLO_SHADER_IDS as readonly string[]).includes(value)
  );
}

const POKEMON_SHADERS: Readonly<Record<PokemonHoloShaderId, HoloShader>> = {
  /**
   * SvUltraGoldRainbow — Live-first (frag + plates), not Simey secret-rare.
   *
   * Two iridescence/light passes + etch fingerprint:
   *   1. Spectrum SVHolo2 + counter bands + gold tint → `exclusion`
   *      (color-dodge alone bleaches Live gold art).
   *   2. Glitter + specular glare → quiet `color-dodge`.
   *   3. Raw `_CardEtch` × Gold_Band → `soft-light` (ornament fingerprint;
   *      Ultra Gold etch is bright-figure / dark-ornament — never invert).
   * Cold-foil stays WebGL paint; invert-as-mask punched figure/rim.
   * Full-card (no white-plate CSS mask — WP greys the figure).
   */
  ultraGoldRainbow: {
    ...look(
      "ultraGoldRainbow",
      [
        // Size ≫ 100% so compressed `--background-x/y` still travels a long
        // way without walking the box edge onto the card.
        band(bands(SV_SPECTRUM, 55, 16), "320% 320%", "scroll"),
        band(bands(SV_COUNTER, -48, 34), "360% 360%", "counter"),
        spectrumTall("FX_T_Spectrum_SVHolo2", "100% 320%"),
        // Gold is a flat slab in the extract, so it lands here as a tint.
        band(
          `linear-gradient(${GOLD_TINT}, ${GOLD_TINT})`,
          "100% 100%",
          "still",
        ),
      ],
      {
        blend: "hard-light, overlay, hard-light",
        mix: "exclusion",
        opacity: 0.42,
        brightness: [0.7, 0.25],
        contrast: [1.75, 0.5],
        saturate: [1.45, 0.7],
      },
    ),
    overlay: "ultraGoldRainbowCoat",
  },

  /**
   * Specular pass — glitter tooth + pointer glare under pre-dimmed dodge.
   */
  ultraGoldRainbowCoat: {
    ...look(
      "ultraGoldRainbowCoat",
      [
        tooth("FX_T_SVUltra_Glitter", "140px 140px"),
        // `lean` keeps pos in 0–100% so an oversized lobe never walks its box
        // edge onto the card (counter × combined reached -300% at bottom-right).
        glare(112, "200% 200%", "lean"),
        glare(-70, "250% 250%", "drift", 34),
      ],
      {
        blend: "color-dodge, screen",
        mix: "color-dodge",
        // Same ceiling as Radiant: dodge above ~0.5 washes pale art.
        opacity: 0.34,
        brightness: [0.32, 0.28],
        contrast: [1.6, 0.6],
        pointerFalloff: false,
      },
    ),
    overlay: "ultraGoldRainbowEtch",
  },

  /**
   * Etch fingerprint + Gold_Band tooth — Unity samples both after spectrum.
   * Raw Live etch via `--foil-etch` (HoloCardImage); no invert.
   */
  ultraGoldRainbowEtch: look(
    "ultraGoldRainbowEtch",
    [
      band(
        `var(--foil-etch, linear-gradient(hsl(0, 0%, 12%), hsl(0, 0%, 18%)))`,
        "100% 100%",
        "still",
      ),
      shine("FX_T_Highlight_Gold_Band", "220% 220%"),
    ],
    {
      blend: "multiply",
      mix: "soft-light",
      opacity: 0.62,
      brightness: [1.0, 0.08],
      contrast: [1.35, 0.25],
      saturate: [0.6, 0.15],
      pointerFalloff: false,
    },
  ),

  /** Same plates as GoldRainbow; Scodix is a raised spot varnish, so tighter
   *  tooth and more bite. Etch fingerprint shared with Ultra Gold. */
  ultraScodix: {
    ...look(
      "ultraScodix",
      [
        spectrumTall("FX_T_Spectrum_SVHolo2"),
        shine("FX_T_Highlight_Gold_Band"),
        tooth("FX_T_SVUltra_Glitter", "120px 120px"),
      ],
      {
        blend: "overlay, hard-light",
        mix: "overlay",
        opacity: 0.55,
        contrast: [1.15, 0.5],
        saturate: [1.05, 0.6],
        pointerFalloff: false,
      },
    ),
    overlay: "ultraGoldRainbowEtch",
  },

  /**
   * SwSecret / SwSecreT02 — Live Spectrum + noise + rainbow-holo band underlay
   * (simey analysis) + etch fingerprint.
   */
  swSecret: {
    ...look(
      "swSecret",
      [
        {
          raw: RAINBOW_ALT_BANDS,
          size: "200% 400%",
          motion: "scrollY",
          repeat: "no-repeat",
        },
        spectrum("FX_T_Spectrum", "300% 300%"),
        tooth("T_Noise_Random", "160px 160px"),
        glare(100, "220% 220%", "lean", 28),
      ],
      {
        blend: "luminosity, overlay, soft-light",
        mix: "color-dodge",
        opacity: 0.42,
        brightness: [0.35, 0.25],
        contrast: [1.35, 0.4],
        saturate: [1.4, 0.5],
        pointerFalloff: false,
      },
    ),
    overlay: "swSecretCoat",
  },

  /** Opposite-pan pastel coat (simey rainbow-holo :after) before etch. */
  swSecretCoat: {
    ...look(
      "swSecretCoat",
      [
        tooth("T_Noise_Random", "160px 160px"),
        {
          raw: `linear-gradient(-60deg, ${RAINBOW_PASTEL})`,
          size: "400% 400%",
          motion: "oppositeStrong",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "overlay",
        mix: "color-dodge",
        opacity: 0.38,
        brightness: [0.4, 0.3],
        contrast: [1.3, 0.35],
        saturate: [1.1, 0.4],
        pointerFalloff: false,
      },
    ),
    overlay: "swSecretEtch",
  },

  swSecretEtch: look(
    "swSecretEtch",
    [
      band(
        `var(--foil-etch, linear-gradient(hsl(0, 0%, 12%), hsl(0, 0%, 18%)))`,
        "100% 100%",
        "still",
      ),
      tooth("T_Noise_Random", "180px 180px"),
    ],
    {
      blend: "multiply",
      mix: "soft-light",
      opacity: 0.5,
      brightness: [1.0, 0.08],
      contrast: [1.25, 0.2],
      saturate: [0.7, 0.15],
      pointerFalloff: false,
    },
  ),

  /**
   * SvUltra — Live plates + V-family diagonal ribs + opposite-pan coat
   * (simey v-full-art structure).
   */
  svUltra: {
    ...look(
      "svUltra",
      [
        spectrum("FX_T_Spectrum_Rainbow"),
        shine("FX_T_Spectrum_Sunpillar3"),
        {
          raw: vRibs(),
          size: "300% 100%",
          motion: "scroll",
          repeat: "repeat",
        },
        tooth("FX_T_SVUltra_Glitter"),
      ],
      {
        blend: "overlay, soft-light, hard-light",
        mix: "overlay",
        opacity: 0.5,
        contrast: [1.1, 0.4],
        saturate: [1.15, 0.75],
        pointerFalloff: false,
      },
    ),
    overlay: "svUltraCoat",
  },

  svUltraCoat: look(
    "svUltraCoat",
    [
      spectrum("FX_T_Spectrum_Rainbow", "200% 200%"),
      {
        raw: vRibs(),
        size: "195% 100%",
        motion: "opposite",
        repeat: "repeat",
      },
      tooth("FX_T_SVUltra_Glitter", "140px 140px"),
    ],
    {
      blend: "soft-light, hard-light",
      mix: "exclusion",
      opacity: 0.42,
      contrast: [1.1, 0.35],
      saturate: [1.1, 0.5],
      pointerFalloff: false,
    },
  ),

  /** SVHolo — dual tall spectra + ribs + opposite-pan coat (v-star). */
  svHolo: {
    ...look(
      "svHolo",
      [
        spectrumTall("FX_T_Spectrum_SVHolo2"),
        { tex: "FX_T_Spectrum_SVHolo3", size: "100% 200%", motion: "driftY" },
        {
          raw: vRibs(),
          size: "300% 100%",
          motion: "scroll",
          repeat: "repeat",
        },
        tooth("FX_T_Noise_Dim", "220px 220px"),
      ],
      {
        blend: "overlay, soft-light, hard-light",
        mix: "overlay",
        opacity: 0.48,
        contrast: [1.08, 0.35],
        saturate: [1.1, 0.6],
        pointerFalloff: false,
      },
    ),
    overlay: "svHoloCoat",
  },

  svHoloCoat: look(
    "svHoloCoat",
    [
      spectrumTall("FX_T_Spectrum_SVHolo2", "100% 240%"),
      {
        raw: vRibs(),
        size: "195% 100%",
        motion: "opposite",
        repeat: "repeat",
      },
    ],
    {
      blend: "soft-light, hard-light",
      mix: "exclusion",
      opacity: 0.4,
      contrast: [1.08, 0.3],
      saturate: [1.05, 0.45],
      pointerFalloff: false,
    },
  ),

  /** Sword & Shield everyday holo — Live plates + V ribs (v-regular). */
  swHolo: {
    ...look(
      "swHolo",
      [
        spectrum("FX_T_Spectrum_Bands_Vertical"),
        shine("FX_T_SWHolo_Shine"),
        {
          raw: vRibs(),
          size: "300% 100%",
          motion: "scroll",
          repeat: "repeat",
        },
        plate("FX_T_SWHolo_BG"),
        plate("T_Holofoil_Mask_BWBars"),
      ],
      {
        blend: "overlay, soft-light, hard-light, multiply",
        mix: "overlay",
        opacity: 0.48,
        contrast: [1.05, 0.3],
        saturate: [1.1, 0.55],
        pointerFalloff: false,
      },
    ),
    overlay: "swHoloCoat",
  },

  swHoloCoat: look(
    "swHoloCoat",
    [
      spectrum("FX_T_Spectrum_Bands_Vertical", "200% 200%"),
      {
        raw: vRibs(),
        size: "195% 100%",
        motion: "opposite",
        repeat: "repeat",
      },
      plate("T_Holofoil_Mask_BWBars"),
    ],
    {
      blend: "soft-light, hard-light",
      mix: "soft-light",
      opacity: 0.4,
      contrast: [1.05, 0.28],
      saturate: [1.05, 0.4],
      pointerFalloff: false,
    },
  ),

  /**
   * Cosmos — Live Bright spectrum + carve dots + 3-pass staggered pans
   * (simey cosmos-holo choreography; EN cosmos-*.png → Live plates).
   */
  cosmos: {
    ...look(
      "cosmos",
      [
        spectrum("FX_T_Spectrum_Bands_Rainbow_Bright", "400% 900%"),
        {
          raw: COSMOS_BANDS,
          size: "400% 900%",
          motion: "scroll",
          repeat: "no-repeat",
        },
        shine("FX_T_Gradient_Shine"),
        {
          raw: cosmosSpot(),
          size: "100% 100%",
          motion: "still",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "color-burn, multiply, soft-light",
        mix: "color-dodge",
        opacity: 0.45,
        brightness: [0.55, 0.2],
        contrast: [1.1, 0.35],
        saturate: [1.0, 0.4],
        pointerFalloff: false,
        carve: carve("T_Holofoil_Cosmos_Dots_RGBA_Gradient", "260px 260px"),
      },
    ),
    overlay: "cosmosCoat",
  },

  cosmosCoat: {
    ...look(
      "cosmosCoat",
      [
        tooth("T_CloudNoise", "340px 340px"),
        spectrum("FX_T_Spectrum_Bands_Rainbow_Bright", "400% 700%"),
        {
          raw: COSMOS_BANDS,
          size: "400% 700%",
          motion: "drift",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "lighten, multiply",
        mix: "overlay",
        opacity: 0.42,
        contrast: [1.08, 0.3],
        saturate: [1.1, 0.45],
        pointerFalloff: false,
      },
    ),
    overlay: "cosmosTop",
  },

  cosmosTop: look(
    "cosmosTop",
    [
      spectrum("FX_T_Spectrum_Bands_Rainbow_Bright", "350% 600%"),
      {
        raw: COSMOS_BANDS,
        size: "350% 600%",
        motion: "opposite",
        repeat: "no-repeat",
      },
    ],
    {
      blend: "multiply",
      mix: "multiply",
      opacity: 0.35,
      contrast: [1.05, 0.25],
      saturate: [1.05, 0.35],
      pointerFalloff: false,
    },
  ),

  /**
   * Galaxy — dual-offset glitter + inverted radial + saturation coat
   * (simey amazing-rare); star carve stays Live.
   */
  galaxy: {
    id: "galaxy",
    backgroundImage: [
      `url(${T}/T_Noise_Random.webp)`,
      `url(${T}/T_Noise_Random.webp)`,
      galaxyInvertSpot(),
      `url(${T}/FX_T_Spectrum_Bands_Vertical.webp)`,
      `url(${T}/T_CloudNoise.webp)`,
    ].join(", "),
    backgroundRepeat: "repeat, repeat, no-repeat, repeat, repeat",
    backgroundSize: "25% 25%, 25% 25%, cover, 220% 100%, 380px 380px",
    backgroundPosition:
      "40% 45%, 55% 55%, center, var(--background-x, 50%) center, center",
    backgroundBlendMode: "soft-light, color-burn, soft-light, overlay",
    mixBlendMode: "overlay",
    opacity: 0.5,
    filter: `brightness(${lit(0.7, 0.2)}) contrast(${lit(1.1, 0.35)}) saturate(${lit(1.0, 0.4)})`,
    pointerFalloff: false,
    carve: carve("T_Holofoil_Galaxy_Stars", "300px 300px"),
    overlay: "galaxyCoat",
  },

  /** Saturation coat — Live vertical spectrum at exaggerated opposite pan. */
  galaxyCoat: look(
    "galaxyCoat",
    [
      spectrum("FX_T_Spectrum_Bands_Vertical", "400% 800%"),
      {
        raw: bands(SV_SPECTRUM, 55, 14),
        size: "400% 800%",
        motion: "oppositeStrong",
        repeat: "no-repeat",
      },
    ],
    {
      blend: "soft-light",
      mix: "saturation",
      opacity: 0.4,
      brightness: [0.65, 0.2],
      contrast: [1.05, 0.25],
      saturate: [1.0, 0.3],
      pointerFalloff: false,
    },
  ),

  crackedIce: {
    ...look(
      "crackedIce",
      [
        spectrum("FX_T_Spectrum_Bands_DesaturateOneSide"),
        shine("T_Holofoil_Mask_Gradient_LightSheen"),
        tooth("T_CloudNoise_Bright", "300px 300px"),
      ],
      {
        blend: "overlay, screen",
        mix: "overlay",
        opacity: 0.52,
        contrast: [1.12, 0.42],
        saturate: [1.05, 0.5],
        carve: carve("T_Holofoil_Mask_Cracked_Ice_RGB", "100% 100%"),
        pointerFalloff: false,
      },
    ),
    overlay: "crackedIceCoat",
  },

  crackedIceCoat: look(
    "crackedIceCoat",
    [
      spectrum("FX_T_Spectrum_Bands_DesaturateOneSide", "240% 240%"),
      shine("T_Holofoil_Mask_Gradient_LightSheen", "200% 200%"),
    ],
    {
      blend: "soft-light",
      mix: "overlay",
      opacity: 0.38,
      contrast: [1.08, 0.3],
      saturate: [1.0, 0.35],
      pointerFalloff: false,
    },
  ),

  /**
   * Rainbow leaf — simey rainbow-alt bands + Live Spectrum_Rainbow /
   * Highlight_Over + opposite-pan coat.
   */
  rainbowFoil: {
    ...look(
      "rainbowFoil",
      [
        {
          raw: RAINBOW_ALT_BANDS,
          size: "200% 400%",
          motion: "scrollY",
          repeat: "no-repeat",
        },
        tooth("T_Noise_Random", "160px 160px"),
        spectrum("FX_T_Spectrum_Rainbow", "400% 200%"),
        shine("FX_T_Highlight_Over", "180% 180%"),
      ],
      {
        blend: "luminosity, overlay, soft-light",
        mix: "color-dodge",
        opacity: 0.42,
        brightness: [0.35, 0.25],
        contrast: [1.5, 0.4],
        saturate: [1.5, 0.5],
        pointerFalloff: false,
      },
    ),
    overlay: "rainbowFoilCoat",
  },

  rainbowFoilCoat: look(
    "rainbowFoilCoat",
    [
      tooth("T_Noise_Random", "160px 160px"),
      shine("FX_T_Highlight_Over", "180% 180%"),
      spectrum("FX_T_Spectrum_Rainbow", "400% 200%"),
      {
        raw: `linear-gradient(-60deg, ${RAINBOW_PASTEL})`,
        size: "400% 400%",
        motion: "oppositeStrong",
        repeat: "no-repeat",
      },
    ],
    {
      blend: "overlay, soft-light, soft-light",
      mix: "color-dodge",
      opacity: 0.38,
      brightness: [0.45, 0.3],
      contrast: [1.4, 0.35],
      saturate: [1.0, 0.35],
      pointerFalloff: false,
    },
  ),

  /** Rainbow02 — rainbow-holo dual pastel + Live Spectrum + coat. */
  rainbow02: {
    ...look(
      "rainbow02",
      [
        {
          raw: RAINBOW_ALT_BANDS,
          size: "200% 400%",
          motion: "scrollY",
          repeat: "no-repeat",
        },
        tooth("T_Noise_Random", "160px 160px"),
        spectrum("FX_T_Spectrum", "400% 200%"),
        shine("FX_T_Highlight_Over", "180% 180%"),
      ],
      {
        blend: "luminosity, soft-light, soft-light",
        mix: "color-dodge",
        opacity: 0.42,
        brightness: [0.4, 0.25],
        contrast: [1.4, 0.35],
        saturate: [1.3, 0.45],
        pointerFalloff: false,
      },
    ),
    overlay: "rainbow02Coat",
  },

  rainbow02Coat: look(
    "rainbow02Coat",
    [
      tooth("T_Noise_Random", "160px 160px"),
      spectrum("FX_T_Spectrum", "400% 200%"),
      {
        raw: `linear-gradient(-45deg, ${RAINBOW_PASTEL})`,
        size: "400% 400%",
        motion: "oppositeStrong",
        repeat: "no-repeat",
      },
    ],
    {
      blend: "overlay, soft-light",
      mix: "color-dodge",
      opacity: 0.38,
      brightness: [0.45, 0.3],
      contrast: [1.35, 0.3],
      saturate: [1.05, 0.35],
      pointerFalloff: false,
    },
  ),

  /**
   * SunPillar — poke-151 `ex-regular` **composition** (double rare EX cards),
   * painted with Live plates / Live-measured hues.
   *
   * Simey stack (`ex-regular.css`): grain → horizontal sunpillar ramp → 133°
   * ribs → pointer spot; `:after` opposite pan; `.card__glitter` hard-light.
   * Live paint: raw dump hues + darkened ribs. Avoid `screen`/`lighten`/
   * `difference` on full-card plates — they milk dark Live art grey-white.
   * CastAndCure stars = Northern Cross carve + dodge (Unity's CC punch).
   */
  sunPillar: {
    ...look(
      "sunPillar",
      [
        // No FX_T_Gradient_Shine — mid-grey grain (μ≈143) screens to a milk
        // haze on dark Live art. Simey's --grain is authored for lighten.
        {
          raw: liveSunPillarBands("0deg"),
          size: "200% 700%",
          motion: "scrollYEdge",
          repeat: "no-repeat",
        },
        {
          raw: sunPillarRibs(),
          size: "300% 100%",
          motion: "scroll",
          repeat: "no-repeat",
        },
        {
          raw: pillarSpot(),
          size: "200% 100%",
          motion: "lean",
          repeat: "no-repeat",
        },
      ],
      {
        // soft-light keeps dark Live art's blacks; screen lifted them to milk.
        blend: "soft-light, hard-light",
        mix: "soft-light",
        opacity: 0.45,
        brightness: [0.9, 0.2],
        contrast: [1.3, 0.25],
        saturate: [1.7, 0.3],
        pointerFalloff: false,
      },
    ),
    overlay: "sunPillarCoat",
  },

  /** Simey `.card__shine:after` — opposite rib pan. */
  sunPillarCoat: {
    ...look(
      "sunPillarCoat",
      [
        {
          raw: liveSunPillarBands("0deg"),
          size: "200% 400%",
          motion: "scrollYEdge",
          repeat: "no-repeat",
        },
        {
          raw: sunPillarRibs(),
          size: "195% 100%",
          motion: "opposite",
          repeat: "no-repeat",
        },
        {
          raw: pillarSpot(),
          size: "200% 100%",
          motion: "lean",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "soft-light, hard-light",
        mix: "soft-light",
        opacity: 0.28,
        brightness: [0.88, 0.18],
        contrast: [1.2, 0.2],
        saturate: [1.5, 0.25],
        pointerFalloff: false,
      },
    ),
    overlay: "sunPillarGlitter",
  },

  /** Simey `.card__glitter` — sparkle pass; Live glitter tooth. */
  sunPillarGlitter: look(
    "sunPillarGlitter",
    [
      {
        raw: sunPillarGlitterSpot(),
        size: "cover",
        motion: "still",
        repeat: "no-repeat",
      },
      {
        raw: liveSunPillarBands("133deg"),
        size: "500% 500%",
        motion: "lean",
        repeat: "no-repeat",
      },
      {
        tex: "FX_T_SVUltra_Glitter",
        size: "25% 25%",
        motion: "still",
        repeat: "repeat",
      },
      {
        tex: "T_Noise_Random",
        size: "140% 140%",
        motion: "still",
        repeat: "repeat",
      },
    ],
    {
      blend: "darken, soft-light, lighten",
      mix: "soft-light",
      opacity: 0.35,
      brightness: [1.15, 0.25],
      contrast: [1.1, 0.15],
      saturate: [1.3, 0.2],
      pointerFalloff: false,
    },
  ),

  /**
   * CastAndCure — same ex-regular shine/coat; glitter pass adds Northern Cross
   * × SVHolo2 (Live `_Tex_CC` / `_Tex_CC_Spectrum`).
   */
  sunPillarCc: {
    ...look(
      "sunPillarCc",
      [
        {
          raw: liveSunPillarBands("0deg"),
          size: "200% 700%",
          motion: "scrollYEdge",
          repeat: "no-repeat",
        },
        {
          raw: sunPillarRibs(),
          size: "300% 100%",
          motion: "scroll",
          repeat: "no-repeat",
        },
        {
          raw: pillarSpot(),
          size: "200% 100%",
          motion: "lean",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "soft-light, hard-light",
        mix: "soft-light",
        opacity: 0.45,
        brightness: [0.9, 0.2],
        contrast: [1.3, 0.25],
        saturate: [1.7, 0.3],
        pointerFalloff: false,
      },
    ),
    overlay: "sunPillarCcCoat",
  },

  sunPillarCcCoat: {
    ...look(
      "sunPillarCcCoat",
      [
        {
          raw: liveSunPillarBands("0deg"),
          size: "200% 400%",
          motion: "scrollYEdge",
          repeat: "no-repeat",
        },
        {
          raw: sunPillarRibs(),
          size: "195% 100%",
          motion: "opposite",
          repeat: "no-repeat",
        },
        {
          raw: pillarSpot(),
          size: "200% 100%",
          motion: "lean",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "soft-light, hard-light",
        mix: "soft-light",
        opacity: 0.28,
        brightness: [0.88, 0.18],
        contrast: [1.2, 0.2],
        saturate: [1.5, 0.25],
        pointerFalloff: false,
      },
    ),
    overlay: "sunPillarCcGlitter",
  },

  sunPillarCcGlitter: look(
    "sunPillarCcGlitter",
    [
      {
        tex: "FX_T_Spectrum_SVHolo2",
        size: "140% 320%",
        motion: "scrollY",
        repeat: "no-repeat",
      },
      {
        tex: "FX_T_Spectrum_SVHolo2",
        size: "140% 280%",
        motion: "counterY",
        repeat: "no-repeat",
      },
    ],
    {
      // Dodge + dark exposure — stars punch chroma without full-card milk.
      blend: "screen",
      mix: "color-dodge",
      opacity: POKEMON_CSS_DODGE_OPACITY_CEILING,
      brightness: [0.42, 0.35],
      contrast: [1.55, 0.3],
      saturate: [2.0, 0.4],
      carve: carve("FX_T_Northern_Cross", "160px 160px"),
      pointerFalloff: false,
    },
  ),

  sunBeam: look(
    "sunBeam",
    [spectrum("FX_T_Spectrum_Sunbeam"), shine("FX_T_Gradient_Shine")],
    {
      blend: "screen",
      mix: "overlay",
      opacity: 0.48,
      contrast: [1.1, 0.4],
      saturate: [1.15, 0.7],
    },
  ),

  sunLava: look(
    "sunLava",
    [spectrum("FX_T_Spectrum_Bands_Rainbow"), shine("FX_T_Gradient_Shine")],
    {
      blend: "screen",
      mix: "overlay",
      opacity: 0.48,
      contrast: [1.12, 0.45],
      saturate: [1.2, 0.8],
    },
  ),

  /**
   * Plain reverse-holo silver. GLES desats the FlatSilver spectrum 75% toward
   * luma then ×0.33 — keep CSS quiet (soft-light, low sat) so we do not read as
   * a rainbow wash. SVHolo2 belongs only on CC laminates (`flatSilverCc*`).
   */
  flatSilver: {
    ...look(
      "flatSilver",
      [
        {
          raw: reverseRadial(),
          size: "120% 120%",
          motion: "still",
          repeat: "no-repeat",
        },
        {
          raw: reverseDiagonal(),
          size: "200% 200%",
          motion: "lean",
          repeat: "no-repeat",
        },
        spectrum("FX_T_Spectrum_FlatSilver"),
        shine("T_Holofoil_Mask_Bar_Wide_Single"),
        tooth("FX_T_SVUltra_Glitter", "150px 150px"),
      ],
      {
        blend: "soft-light, soft-light, overlay, soft-light",
        mix: "soft-light",
        opacity: 0.34,
        brightness: [0.55, 0.15],
        contrast: [1.05, 0.25],
        saturate: [0.45, 0.2],
        pointerFalloff: false,
      },
    ),
    overlay: "flatSilverCoat",
  },

  /**
   * Opposite-pan silver coat. Do not paint `_Tex_CC_Spectrum` (SVHolo2): the
   * MAT leaves `_Tex_CC` unbound, and the frag gates that rainbow on CC alpha.
   * Painting it here was the CSS half of the Reshiram FlatSilver wash.
   */
  flatSilverCoat: look(
    "flatSilverCoat",
    [
      {
        raw: reverseDiagonal(),
        size: "220% 220%",
        motion: "opposite",
        repeat: "no-repeat",
      },
      spectrum("FX_T_Spectrum_FlatSilver", "240% 240%"),
      tooth("FX_T_SVUltra_Glitter", "150px 150px"),
    ],
    {
      blend: "soft-light, soft-light, soft-light",
      mix: "soft-light",
      opacity: 0.28,
      contrast: [1.05, 0.2],
      saturate: [0.4, 0.2],
      pointerFalloff: false,
    },
  ),

  /** Poké Ball reverse laminate — grey base laminate + Live plates + carve. */
  flatSilverCc: look(
    "flatSilverCc",
    [
      {
        raw: pokeBallLaminate(),
        size: "200% 200%",
        motion: "lean",
        repeat: "no-repeat",
      },
      spectrum("FX_T_Spectrum_FlatSilver"),
      spectrumTall("FX_T_Spectrum_SVHolo2"),
      shine("T_Holofoil_Mask_Bar_Wide_Single"),
      tooth("FX_T_SVUltra_Glitter", "150px 150px"),
    ],
    {
      blend: "color-dodge, overlay, hard-light, screen",
      mix: "overlay",
      opacity: 0.48,
      brightness: [0.55, 0.2],
      contrast: [1.1, 0.4],
      saturate: [1.1, 0.6],
      carve: carve("TEX_CC_PB", "190px 190px"),
      pointerFalloff: false,
    },
  ),

  /** Master Ball reverse laminate (`ReverseLaminateMasterBall`). */
  flatSilverCcMb: look(
    "flatSilverCcMb",
    [
      {
        raw: pokeBallLaminate(),
        size: "200% 200%",
        motion: "lean",
        repeat: "no-repeat",
      },
      spectrum("FX_T_Spectrum_FlatSilver"),
      spectrumTall("FX_T_Spectrum_SVHolo2"),
      shine("T_Holofoil_Mask_Bar_Wide_Single"),
      tooth("FX_T_SVUltra_Glitter", "150px 150px"),
    ],
    {
      blend: "color-dodge, overlay, hard-light, screen",
      mix: "overlay",
      opacity: 0.48,
      brightness: [0.55, 0.2],
      contrast: [1.1, 0.4],
      saturate: [1.1, 0.6],
      carve: carve("TEX_CC_MB", "190px 190px"),
      pointerFalloff: false,
    },
  ),

  solidColor: look(
    "solidColor",
    [
      spectrum("FX_T_Spectrum_Bands_DesaturateOneSide"),
      shine("T_Holofoil_Mask_Gradient_LightSheen"),
      plate("T_HoloFoil_Bars_Mask"),
    ],
    {
      blend: "overlay, soft-light",
      mix: "overlay",
      opacity: 0.45,
      contrast: [1.06, 0.3],
      saturate: [1.05, 0.45],
    },
  ),

  squares: look(
    "squares",
    [
      // Direction maps stay out (RG fields). Drawable: vertical bands + squares hue.
      spectrum("FX_T_Spectrum_Bands_Vertical"),
      tooth("FX_T_Spectrum_Squares", "200px 200px"),
      tooth("FX_T_Spectrum_Squares_Hue", "220px 220px"),
    ],
    {
      blend: "overlay, soft-light",
      mix: "overlay",
      opacity: 0.5,
      contrast: [1.1, 0.4],
      saturate: [1.15, 0.65],
    },
  ),

  thatch: look(
    "thatch",
    [
      spectrum("FX_T_Spectrum_Bands_Vertical"),
      tooth("T_Noise_Random", "160px 160px"),
    ],
    {
      blend: "soft-light",
      mix: "overlay",
      opacity: 0.48,
      contrast: [1.1, 0.38],
      saturate: [1.1, 0.6],
    },
  ),

  tinsel: look(
    "tinsel",
    [
      // MAT: Spectrum_Rainbow + Bright + Shine + Dull + Tinsel_Bars.
      spectrum("FX_T_Spectrum_Bands_Rainbow"),
      spectrum("FX_T_Spectrum_Bands_Rainbow_Bright"),
      shine("FX_T_Gradient_Shine"),
      shine("FX_T_Gradient_Shine_Dull"),
      tooth("FX_T_Tinsel_Bars", "100% 240px"),
    ],
    {
      blend: "overlay, hard-light, screen, soft-light",
      mix: "overlay",
      opacity: 0.5,
      contrast: [1.12, 0.45],
      saturate: [1.2, 0.75],
    },
  ),

  /**
   * Radiant — poke-holo `radiant-holo.css` as three elements / three mixes:
   *
   *   radiantHoloCoat     → etch + pastel (1× color-dodge)  [under]
   *   radiantHolo         → ±45° lattice (1× color-dodge)
   *   radiantHoloSparkle  → glitter (overlay)               [top]
   *
   * Paint order diverges from Simey DOM (shine → :after → :before): Live etch
   * has no crosshatch bake, so coat-above-lattice color-dodges the lozenges
   * away. `HoloCardImage` draws coat → lattice → sparkle. Spot stays always
   * lit (glare `--opacity` is `.card__glare` only — idle/spring must not gate
   * the exclusion disc).
   *
   * Plus `.card__glare` from `HoloCardImage` (hard-light). No extra dodge passes.
   *
   * Plates are Live / Unity (per locale), not Simey's EN `*_radiantholo` scans:
   *   spot / bars / rainbow CSS  → simey choreography
   *   lattice pan / size         → FPTI dosage (×0.9, 240%) — quieter than
   *                                poke-holo ×1.5 / 210% with Live etch
   *   var(--foil)                → Live `_CardEtch` via `--foil-etch`, inverted
   *   var(--glitter)             → `T_Noise_Random` grayscale+dimmed
   *   shine mask                 → coat/sparkle only via invert(etch)→alpha;
   *                                lattice unmasked (etch has no lozenge bake)
   */
  radiantHolo: {
    id: "radiantHolo",
    backgroundImage: [
      radiantSpotInLattice(),
      radiantBars(45),
      radiantBars(-45),
    ].join(", "),
    backgroundRepeat: "no-repeat, no-repeat, no-repeat",
    // FPTI RadiantHolo: 240% with ×0.9 pan (simey uses 210% / ×1.5).
    backgroundSize: "cover, 240% 240%, 240% 240%",
    backgroundPosition: [
      "center",
      POSITION.radiantPan,
      POSITION.radiantPan,
    ].join(", "),
    backgroundBlendMode: "exclusion, darken, color-dodge",
    mixBlendMode: "color-dodge",
    // Above the coat: lozenges need weight; ~0.48 keeps global brightness in check.
    opacity: 0.48,
    filter: "brightness(0.55) contrast(2.05) saturate(1.8)",
    pointerFalloff: false,
    clipPath: "inset(2.8% 4% round 2.55% / 1.5%)",
    overlay: "radiantHoloCoat",
  },

  /**
   * `.card__shine:after` — poke-holo: **`var(--foil)` on top**, pastel rainbow
   * under, then `color-dodge` onto the card.
   *
   * `--foil-etch` must already be simey polarity (light on black). Live etch is
   * inverted in `HoloCardImage` via `useInvertedPaintBlob` before it is named
   * here — do not invert again in this stack.
   *
   * Simey uses `hard-light` between foil and rainbow + contrast(3). Live etch
   * is hotter: that combo carves fingerprint striations into dark Pokémon.
   * `soft-light` + milder contrast keeps the wash; lattice (above) still carries
   * the lozenges.
   */
  radiantHoloCoat: {
    id: "radiantHoloCoat",
    backgroundImage: [radiantFoilLayer(), radiantRainbow()].join(", "),
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: "cover, 400% 100%",
    backgroundPosition: ["center", POSITION.radiantCoat].join(", "),
    backgroundBlendMode: "soft-light",
    mixBlendMode: "color-dodge",
    opacity: 0.42,
    filter: "brightness(0.62) contrast(1.2) saturate(1.5)",
    pointerFalloff: false,
    clipPath: "inset(9.85% 8% 52.85% 8%)",
    overlay: "radiantHoloSparkle",
  },

  /** `.card__shine:before` — glitter + dark radial, overlay.
   *
   * Simey `glitter.png` is dark flecks (μ≈51). Live `T_Noise_Random` is mid
   * RGB grain (μ≈143). Grayscale + lower brightness before the shared
   * contrast/saturate keeps the overlay tooth from washing the card.
   */
  radiantHoloSparkle: {
    id: "radiantHoloSparkle",
    backgroundImage: [
      `url(${T}/T_Noise_Random.webp)`,
      `radial-gradient(farthest-corner ellipse at calc(((var(--pointer-x, var(--colorX, 50%))) * 0.5) + 25%) calc(((var(--pointer-y, var(--colorY, 50%))) * 0.5) + 25%), hsla(0, 0%, 58%, 0.8) 10%, hsla(0, 0%, 20%, 0.9) 20%, hsla(0, 0%, 20%, 0.5) 50%)`,
    ].join(", "),
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "15% 15%, 350% 350%",
    backgroundPosition: "center, center",
    backgroundBlendMode: "color-dodge",
    mixBlendMode: "overlay",
    opacity: 1,
    // 0.66×(51/143)≈0.24 — land near simey's post-filter glitter energy.
    filter: "grayscale(1) brightness(0.28) contrast(2.2) saturate(0.5)",
    pointerFalloff: false,
    clipPath: "inset(2.8% 4% round 2.55% / 1.5%)",
  },

  aceFoil: {
    ...look(
      "aceFoil",
      [
        spectrum("FX_T_Spectrum_BlackSide"),
        shine("FX_T_Gradient_Shine"),
        crossShine("FX_T_Gradient_Shine_Rotate_90"),
        {
          raw: vRibs("-33deg"),
          size: "300% 100%",
          motion: "scroll",
          repeat: "repeat",
        },
        plate("T_Holofoil_Mask_Bar_Thin_Single"),
      ],
      {
        blend: "screen, multiply, soft-light, hard-light",
        mix: "overlay",
        opacity: 0.48,
        contrast: [1.1, 0.42],
        saturate: [1.15, 0.65],
        pointerFalloff: false,
      },
    ),
    overlay: "aceFoilCoat",
  },

  aceFoilCoat: look(
    "aceFoilCoat",
    [
      spectrum("FX_T_Spectrum_BlackSide", "240% 240%"),
      {
        raw: vRibs("-33deg"),
        size: "195% 100%",
        motion: "opposite",
        repeat: "repeat",
      },
      shine("FX_T_Gradient_Shine", "200% 200%"),
    ],
    {
      blend: "soft-light, hard-light",
      mix: "lighten",
      opacity: 0.4,
      contrast: [1.08, 0.3],
      saturate: [1.1, 0.45],
      pointerFalloff: false,
    },
  ),

  /**
   * AngledPillars — Simey `diagonalFamily` / poke-151 `ex-full-art`:
   *   Gradient_Shine → Live `Bands_Angled` (200%×700%, scrollY) → 128.5° ribs
   *   (300%×100%, shear) → pointer spot. Coat mirrors with opposite pan.
   * Seamless: every layer `no-repeat`; gradients tile inside one plate
   * (Simey sizes — not `background-repeat` on diagonals).
   */
  angledPillars: {
    ...look(
      "angledPillars",
      [
        {
          tex: "FX_T_Gradient_Shine",
          size: "cover",
          motion: "still",
          repeat: "no-repeat",
        },
        {
          tex: "FX_T_Spectrum_Bands_Angled",
          size: "200% 700%",
          motion: "scrollYEdge",
          repeat: "no-repeat",
        },
        {
          raw: angledExRibs(),
          size: "300% 100%",
          motion: "shear",
          repeat: "no-repeat",
        },
        {
          raw: pillarSpot(),
          size: "200% 100%",
          motion: "lean",
          repeat: "no-repeat",
        },
      ],
      {
        blend: "soft-light, soft-light, hue, hard-light",
        mix: "color-dodge",
        opacity: POKEMON_CSS_DODGE_OPACITY_CEILING,
        brightness: [0.5, 0.4],
        contrast: [1.5, 0.2],
        saturate: [1.5, 0.15],
        pointerFalloff: false,
      },
    ),
    overlay: "angledPillarsCoat",
  },

  angledPillarsCoat: look(
    "angledPillarsCoat",
    [
      {
        tex: "FX_T_Gradient_Shine",
        size: "cover",
        motion: "still",
        repeat: "no-repeat",
      },
      {
        tex: "FX_T_Spectrum_Bands_Angled",
        size: "200% 400%",
        motion: "scrollYEdge",
        repeat: "no-repeat",
      },
      {
        raw: angledExRibs(),
        size: "195% 100%",
        motion: "shearOpposite",
        repeat: "no-repeat",
      },
      {
        raw: pillarSpot(),
        size: "200% 100%",
        motion: "lean",
        repeat: "no-repeat",
      },
    ],
    {
      blend: "soft-light, soft-light, hue, hard-light",
      mix: "exclusion",
      opacity: 0.55,
      brightness: [0.5, 0.4],
      contrast: [1.5, 0.2],
      saturate: [1.25, 0.15],
      pointerFalloff: false,
    },
  ),

  /** A stamped foil has no spectrum of its own — it is a shine and nothing else. */
  stamped: look("stamped", [shine("FX_T_Gradient_Shine", "250% 250%")], {
    blend: "normal",
    mix: "overlay",
    opacity: 0.4,
    contrast: [1.05, 0.3],
    brightness: [1.0, 0.25],
  }),

  confetti25th: look(
    "confetti25th",
    [
      // `_TexDistort` (CloudNoise) stays out — vector field, not a picture.
      spectrum("FX_T_Spectrum_Celebration"),
      shine("FX_T_Highlight_Over"),
      tooth("FX_T_Celeb_Confetti", "220px 220px"),
    ],
    {
      blend: "overlay, screen",
      mix: "overlay",
      opacity: 0.5,
      contrast: [1.1, 0.4],
      saturate: [1.2, 0.75],
    },
  ),
};

export function pokemonHoloShader(id: PokemonHoloShaderId): HoloShader {
  return POKEMON_SHADERS[id];
}
