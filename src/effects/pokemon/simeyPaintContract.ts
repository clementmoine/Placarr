/**
 * Materials contract for Simey CSS integration.
 *
 * Product rule: keep Simey’s compositing (blends / layer order / pointer).
 * Supply paint that matches their **input space** from our sources
 * (Live multi-locale + optional Malie raw), not by forking the recipe.
 *
 * Slot map (Simey CSS vars → Placarr):
 * - face          → Live art (locale of the print)
 * - --foil        → Live etch / Malie foil, projected to light-on-black μ≈Simey
 * - --mask        → Live white-plate / Malie etch coverage (alpha)
 * - --glitter     → vendored `simey_glitter` (Simey poke-holo `glitter.png`)
 * - --grain       → vendored `simey_grain` (poke-holo `grain.webp`)
 * - cosmos stack  → vendored `simey_cosmos-*` (poke-holo cosmos-holo layers)
 * - shared FX     → Live `/assets/pokemon/textures` for spectrum/bars;
 *                   finish motifs (`simey_illusion`, pokeball, iri…) available
 *                   under the same textures dir for recipes that need them
 */

export const SIMEY_PAINT_SLOTS = [
  "face",
  "foil",
  "mask",
  "glitter",
  "sharedFx",
] as const;

export type SimeyPaintSlot = (typeof SIMEY_PAINT_SLOTS)[number];

export type SimeyPaintSlotStatus = "ok" | "adapt" | "missing" | "n/a";

/**
 * What a Simey-backed look needs before we can ship the staging recipe
 * without CSS forks (soft-light, reordered layers, …).
 */
export type SimeyMaterialsBrief = {
  /** Live leaf or catalogue finish. */
  finish: string;
  /** poke-holo / poke-151 CSS stem. */
  simeyStem: string;
  slots: Readonly<Record<SimeyPaintSlot, SimeyPaintSlotStatus>>;
  /** Topological blocker (e.g. Radiant bars not in Live etch). */
  topologyNote?: string;
};

/**
 * Static readiness — Live inventory exists; paint-space projection still
 * `adapt` until `simeyPaintSpace` normalizers land.
 */
export const SIMEY_MATERIALS_BRIEFS: readonly SimeyMaterialsBrief[] = [
  {
    finish: "RadiantHolo",
    simeyStem: "radiant-holo",
    slots: {
      face: "ok",
      foil: "adapt", // Live etch polarity + μ
      mask: "adapt", // etch→alpha; lattice is CSS (not baké in Live etch)
      glitter: "ok", // vendored simey_glitter (lang-agnostic)
      sharedFx: "ok",
    },
    topologyNote:
      "Live etch has no crosshatch — bars stay CSS; coat uses projected etch.",
  },
  {
    finish: "Rainbow / Rainbow02",
    simeyStem: "rainbow-holo / rainbow-alt",
    slots: {
      face: "ok",
      foil: "adapt",
      mask: "ok", // Live wp / reverse mask
      glitter: "ok",
      sharedFx: "ok", // Live Spectrum*
    },
  },
  {
    finish: "FlatSilver (+ Cc)",
    simeyStem: "reverse-holo / poke-ball-holo",
    slots: {
      face: "ok",
      foil: "adapt",
      mask: "ok",
      glitter: "ok",
      sharedFx: "ok",
    },
  },
  {
    finish: "SwSecret",
    simeyStem: "secret-rare",
    slots: {
      face: "ok",
      foil: "adapt",
      mask: "adapt",
      glitter: "ok",
      sharedFx: "ok",
    },
  },
  {
    finish: "Cosmos / Galaxy",
    simeyStem: "cosmos-holo / amazing-rare",
    slots: {
      face: "ok",
      foil: "ok", // Cosmos: no per-card foil; Galaxy: Live etch as --foil
      mask: "ok", // Galaxy star carve = Live; Cosmos full-card
      glitter: "ok",
      sharedFx: "ok", // simey_cosmos-* + simey_glitter + Live spectrum
    },
  },
  {
    finish: "V-family / SunPillar",
    simeyStem: "v-* / ex-regular",
    slots: {
      face: "ok",
      foil: "adapt",
      mask: "ok",
      glitter: "ok",
      sharedFx: "ok",
    },
  },
];

/** True when every slot is `ok` or `n/a` (no adapt/missing). */
export function simeyMaterialsReady(brief: SimeyMaterialsBrief): boolean {
  return SIMEY_PAINT_SLOTS.every((slot) => {
    const s = brief.slots[slot];
    return s === "ok" || s === "n/a";
  });
}
