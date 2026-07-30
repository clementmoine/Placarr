"use client";

import { useMemo, useState } from "react";

import { HoloCardImage } from "@/components/HoloCardImage";
import {
  HOLO_SHADER_IDS,
  holoShader,
  varnishShader,
  NEUTRAL_VARNISH_COLOR,
  type HoloShader,
  type HoloTuning,
} from "@/core/render/holoShaders";
import {
  APP_HOLO_SHADER_IDS,
  appHoloShader,
} from "@/core/render/holoShadersApp";
import { cn } from "@/lib/shared/utils";

/**
 * A bench for every look the app can draw, from either texture set.
 *
 * It exists because the looks were only ever visible on whichever cards the
 * collection happened to hold: two of the thirteen finishes were drawn as
 * silver for months precisely because nothing showed them side by side.
 *
 * Two sources, deliberately side by side rather than one replacing the other:
 *
 * - **Web** — transcribed from the publisher's stylesheet and pinned to it by
 *   `holoShaderParity.test.ts`. This is what ships today.
 * - **App** — the same blend structure over the mobile app's per-effect
 *   textures, which give each finish its own colour ramp where the web viewer
 *   shares one. Judged by eye here until it is worth migrating to.
 *
 * The axes are the app's own material parameters, the families a CSS blend
 * stack can carry. The ones it cannot (`_Parallax`,
 * `_FoilDisplacementStrength`, `_VarnishBevelStrength`,
 * `_VarnishOutlineStrength`) are surface lighting against a normal, and are
 * named as absent rather than faked: see `docs/tcg_support.md` §9.
 */

type Role = "finish" | "overlay" | "varnish";

const ROLE_OF: Readonly<Record<string, Role>> = {
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
  freeForm2: "finish",
  tempest: "finish",
  calendarWave: "finish",
  loreShine: "overlay",
  satinShine: "overlay",
  hotFoil: "varnish",
  chromeRainbowHotFoil: "varnish",
};

const GROUPS: readonly { role: Role; title: string; hint: string }[] = [
  {
    role: "finish",
    title: "Finitions",
    hint: "Ce que porte la carte. Une par exemplaire, jamais deux.",
  },
  {
    role: "overlay",
    title: "Secondes couches",
    hint: "Dessinées au-dessus de leur finition, à travers le même masque. Jamais seules.",
  },
  {
    role: "varnish",
    title: "Vernis",
    hint: "Le coat estampé, sur son propre masque et sa propre couleur.",
  },
];

const SOURCES = [
  {
    key: "web" as const,
    label: "Effets Web",
    hint: "Transcrits de la feuille de style de l'éditeur, et vérifiés contre elle. Ce qui tourne aujourd'hui.",
    ids: HOLO_SHADER_IDS as readonly string[],
    shaderOf: (id: string) => holoShader(id),
  },
  {
    key: "app" as const,
    label: "Effets App",
    hint: "Notre composition sur les textures de l'app mobile : une rampe de couleur par effet, là où le web en partage une seule.",
    ids: APP_HOLO_SHADER_IDS as readonly string[],
    shaderOf: (id: string) =>
      appHoloShader(id as (typeof APP_HOLO_SHADER_IDS)[number]),
  },
];

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
  const [sourceKey, setSourceKey] = useState<"web" | "app">("web");
  const [tuning, setTuning] = useState<Required<HoloTuning>>(UNTUNED);
  const [tilt, setTilt] = useState(false);

  const source = SOURCES.find((entry) => entry.key === sourceKey) ?? SOURCES[0];
  const isUntuned = useMemo(
    () => AXES.every((axis) => tuning[axis.key] === 1),
    [tuning],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setSourceKey(entry.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              entry.key === sourceKey
                ? "border-primary bg-primary/10 font-semibold"
                : "border-border hover:bg-accent",
            )}
          >
            {entry.label}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({entry.ids.length})
            </span>
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{source.hint}</p>

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
        const ids = source.ids.filter((id) => ROLE_OF[id] === group.role);
        if (ids.length === 0) return null;
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
                const look: HoloShader = source.shaderOf(id);
                return (
                  <figure
                    key={`${source.key}-${id}`}
                    className="flex flex-col gap-1.5"
                  >
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
                        shader={isVarnish ? holoShader(null) : look}
                        varnishShader={isVarnish ? look : varnishShader(null)}
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
