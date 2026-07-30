"use client";

import { useMemo, useState } from "react";

import { HoloCardImage } from "@/components/HoloCardImage";
import {
  HOLO_SHADER_IDS,
  holoShader,
  varnishShader,
  NEUTRAL_VARNISH_COLOR,
  type HoloShaderId,
  type HoloTuning,
} from "@/core/render/holoShaders";

/**
 * A bench for every look the app can draw.
 *
 * It exists because the looks were only ever visible on whichever cards the
 * collection happened to hold: two of the thirteen finishes were drawn as
 * silver for months precisely because nothing showed them side by side. A grid
 * that renders all of them on one artwork makes an unwired look obvious.
 *
 * The axes are the publisher's own, taken from their mobile app's material
 * parameters — the seven families a CSS blend stack can carry. The ones it
 * cannot (`_Parallax`, `_FoilDisplacementStrength`, `_VarnishBevelStrength`,
 * `_VarnishOutlineStrength`) are surface lighting against a normal, and are
 * listed as absent rather than faked: see `docs/tcg_support.md` §9.
 */

/** Which role a look plays, so the grid reads as three groups and not sixteen. */
const ROLES: Readonly<Record<HoloShaderId, "finish" | "overlay" | "varnish">> =
  {
    silver: "finish",
    satin: "finish",
    lore: "finish",
    lava: "finish",
    magma: "finish",
    glitter: "finish",
    verticalWave: "finish",
    seaWave: "finish",
    rainbowPillars: "finish",
    freeForm: "finish",
    tempest: "finish",
    calendarWave: "finish",
    loreShine: "overlay",
    satinShine: "overlay",
    hotFoil: "varnish",
    chromeRainbowHotFoil: "varnish",
  };

const GROUPS = [
  {
    role: "finish" as const,
    title: "Finitions",
    hint: "Ce que porte la carte. Une par exemplaire, jamais deux.",
  },
  {
    role: "overlay" as const,
    title: "Secondes couches",
    hint: "Dessinées au-dessus de leur finition, à travers le même masque. Jamais seules.",
  },
  {
    role: "varnish" as const,
    title: "Vernis",
    hint: "Le coat estampé, sur son propre masque et sa propre couleur.",
  },
];

/** The tuning axes, each an equivalent of one of the app's parameters. */
const AXES = [
  {
    key: "rainbow" as const,
    label: "Arc-en-ciel",
    source: "_RainbowStrength",
    min: 0,
    max: 3,
  },
  {
    key: "inkwash" as const,
    label: "Lavis",
    source: "_Inkwash_Strength",
    min: 0.25,
    max: 3,
  },
  {
    key: "motif" as const,
    label: "Poids du motif",
    source: "_MotifColorWeight",
    min: 0,
    max: 2,
  },
  {
    key: "grain" as const,
    label: "Grain",
    source: "_GlitterSize",
    min: 0.25,
    max: 3,
  },
];

const UNTUNED: Required<HoloTuning> = {
  rainbow: 1,
  inkwash: 1,
  motif: 1,
  grain: 1,
};

/** What the app has and CSS cannot express, named so it is not silently missing. */
const NOT_PORTABLE = [
  "_Parallax",
  "_FoilDisplacementStrength",
  "_VarnishBevelStrength",
  "_VarnishOutlineStrength",
  "_VarnishDistortionStrength",
];

export type FoilPlayroomProps = {
  /** Artwork to draw every look on. */
  imageUrl: string;
  /** The print's foil mask, already local and baked to alpha. */
  maskUrl: string;
  /** Its varnish mask, when the sample print carries one. */
  varnishMaskUrl?: string | null;
};

export function FoilPlayroom({
  imageUrl,
  maskUrl,
  varnishMaskUrl,
}: FoilPlayroomProps) {
  const [tuning, setTuning] = useState<Required<HoloTuning>>(UNTUNED);
  const [tilt, setTilt] = useState(false);
  const isUntuned = useMemo(
    () => AXES.every((axis) => tuning[axis.key] === 1),
    [tuning],
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-border/60 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold">Axes</h3>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={tilt}
                onChange={(event) => setTilt(event.target.checked)}
              />
              Inclinaison au survol
            </label>
            <button
              type="button"
              onClick={() => setTuning(UNTUNED)}
              disabled={isUntuned}
              className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Recettes d&apos;origine
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AXES.map((axis) => (
            <label key={axis.key} className="flex flex-col gap-1 text-xs">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{axis.label}</span>
                <code className="text-[10px] text-muted-foreground">
                  {axis.source}
                </code>
              </span>
              <input
                type="range"
                min={axis.min}
                max={axis.max}
                step={0.025}
                value={tuning[axis.key]}
                onChange={(event) =>
                  setTuning((previous) => ({
                    ...previous,
                    [axis.key]: Number(event.target.value),
                  }))
                }
              />
              <span className="tabular-nums text-muted-foreground">
                ×{tuning[axis.key].toFixed(3)}
              </span>
            </label>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Sans réglage, chaque look est la recette transcrite au caractère près
          — celle que <code>holoShaderParity.test.ts</code> compare à la feuille
          de style de l&apos;éditeur.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Absents faute de médium, pas faute de données :{" "}
          {NOT_PORTABLE.map((name) => (
            <code key={name} className="mr-1.5 text-[10px]">
              {name}
            </code>
          ))}
          — éclairage de surface contre une normale, qu&apos;une pile de modes
          de fusion ne sait pas exprimer.
        </p>
      </section>

      {GROUPS.map((group) => {
        const ids = HOLO_SHADER_IDS.filter((id) => ROLES[id] === group.role);
        return (
          <section key={group.role} className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {group.title}{" "}
                <span className="font-normal text-muted-foreground">
                  ({ids.length})
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">{group.hint}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {ids.map((id) => {
                const isVarnish = group.role === "varnish";
                return (
                  <figure key={id} className="flex flex-col gap-1.5">
                    <div className="aspect-[5/7] w-full overflow-hidden rounded-[4%/3%]">
                      <HoloCardImage
                        imageUrl={imageUrl}
                        alt={id}
                        /* A varnish is drawn on the varnish mask, never the
                           foil one — showing it through the wrong mask would
                           misrepresent both. */
                        maskUrl={maskUrl}
                        varnishMaskUrl={
                          isVarnish ? (varnishMaskUrl ?? maskUrl) : null
                        }
                        shader={isVarnish ? holoShader(null) : holoShader(id)}
                        varnishShader={
                          isVarnish ? varnishShader(id) : varnishShader(null)
                        }
                        varnishColor={NEUTRAL_VARNISH_COLOR}
                        tuning={tuning}
                        tilt={tilt}
                        trackPointer
                      />
                    </div>
                    <figcaption className="text-[11px] font-medium">
                      {id}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
