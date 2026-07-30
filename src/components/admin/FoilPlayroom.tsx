"use client";

import { useState } from "react";

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
  appRecordedParams,
  appRecordedTuning,
} from "@/core/render/holoShadersApp";
import {
  HOUSE_HOLO_SHADER_IDS,
  houseHoloShader,
} from "@/core/render/holoShadersHouse";
import {
  usePrintVariant,
  variantRendering,
} from "@/lib/client/hooks/usePrintVariant";
import { cn } from "@/lib/shared/utils";

/**
 * A bench for every look the app can draw, from either texture set.
 *
 * The looks were only ever visible on whichever cards the collection happened
 * to hold, which is exactly how two of the thirteen finishes stayed drawn as
 * silver for months. Each look is shown on a card that actually carries that
 * finish where the collection has one — a Lava recipe over a Lava print says
 * something a Lava recipe over a Silver print does not, since every recipe ends
 * in `mix-blend-mode` against the artwork underneath.
 *
 * Three sources, side by side rather than one replacing the other:
 *
 * - **Web** — transcribed from the publisher's stylesheet and pinned to it by
 *   `holoShaderParity.test.ts`. What ships today.
 * - **App** — the same blend structure over the mobile app's per-effect
 *   textures, each carrying the settings recorded in its own material.
 * - **Maison** — ours, from before the transcription.
 */

type Role = "finish" | "overlay" | "varnish";

/** Enough of an item for a tile to resolve and draw its own print. */
export type PlayroomSample = {
  id: string;
  name: string;
  variant: string | null;
  printKey: string | null;
  shelfType: string | null;
  imageUrl: string | null;
};

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
    hint: "Notre composition sur les textures de l'app mobile, chacune avec les valeurs enregistrées dans son matériau.",
    ids: APP_HOLO_SHADER_IDS as readonly string[],
    shaderOf: (id: string) =>
      appHoloShader(id as (typeof APP_HOLO_SHADER_IDS)[number]),
  },
  {
    key: "house" as const,
    label: "Effets Maison",
    hint: "Les nôtres, d'avant la transcription : des dégradés et un grain, sans aucune texture. Remplacés parce qu'ils rendaient toutes les finitions pareilles, pas parce qu'ils étaient ratés.",
    ids: HOUSE_HOLO_SHADER_IDS as readonly string[],
    shaderOf: (id: string) =>
      houseHoloShader(id as (typeof HOUSE_HOLO_SHADER_IDS)[number]),
  },
];

/** What the app has and CSS cannot express, named so it is not silently missing. */
const NOT_PORTABLE = [
  "_Parallax",
  "_FoilDisplacementStrength",
  "_VarnishBevelStrength",
  "_VarnishOutlineStrength",
];

/**
 * The card a look is shown on.
 *
 * Matched on the finish name the publisher uses, case-insensitively, since our
 * ids are the same words in camel case. `freeForm` falls back to `FreeForm1`:
 * the web viewer draws both halves with one rule and names neither.
 */
function sampleForLook(
  id: string,
  samples: readonly PlayroomSample[],
): PlayroomSample | null {
  const wanted = id.toLowerCase();
  const exact = samples.find((item) => item.variant?.toLowerCase() === wanted);
  if (exact) return exact;
  if (wanted === "freeform") {
    return (
      samples.find((item) => item.variant?.toLowerCase() === "freeform1") ??
      null
    );
  }
  return null;
}

function RecordedValues({ id }: { id: (typeof APP_HOLO_SHADER_IDS)[number] }) {
  const entries = Object.entries(appRecordedParams(id)).filter(
    ([, value]) => value !== undefined,
  );
  return (
    <span className="text-[10px] text-muted-foreground">
      {entries.length === 0
        ? "aucun réglage"
        : entries.map(([key, value]) => `${key} ${value}`).join(" · ")}
    </span>
  );
}

/**
 * One tile: a look, drawn on its own print.
 *
 * Each resolves its own print rather than the page resolving all of them,
 * because `usePrintVariant` is a hook and there is one card per look. The
 * requests coalesce into a single batch anyway — see `printVariantStore`.
 */
function LookTile({
  lookId,
  look,
  role,
  sample,
  fallback,
  tuning,
  tilt,
  showRecorded,
}: {
  lookId: string;
  look: HoloShader;
  role: Role;
  sample: PlayroomSample | null;
  fallback: {
    imageUrl: string;
    maskUrl: string;
    varnishMaskUrl?: string | null;
  };
  tuning?: HoloTuning;
  tilt: boolean;
  showRecorded: boolean;
}) {
  const printVariant = usePrintVariant(sample?.printKey, sample?.shelfType);
  const own = variantRendering(
    sample?.variant,
    printVariant,
    sample?.imageUrl ?? null,
  );

  // The card's own artwork and mask once it resolved, the shared one until then.
  const usingOwn = Boolean(own.imageUrl && own.foilMaskUrl);
  const imageUrl = usingOwn ? own.imageUrl! : fallback.imageUrl;
  const maskUrl = usingOwn ? own.foilMaskUrl! : fallback.maskUrl;
  const varnishMaskUrl = usingOwn
    ? own.varnishMaskUrl
    : fallback.varnishMaskUrl;
  const isVarnish = role === "varnish";

  return (
    <figure className="flex flex-col gap-1.5">
      <div className="aspect-[5/7] w-full overflow-hidden rounded-[4%/3%]">
        <HoloCardImage
          imageUrl={imageUrl}
          alt={lookId}
          /* A varnish is drawn on the varnish mask, never the foil one —
             showing it through the wrong mask would misrepresent both. */
          maskUrl={maskUrl}
          varnishMaskUrl={isVarnish ? (varnishMaskUrl ?? maskUrl) : null}
          shader={isVarnish ? holoShader(null) : look}
          varnishShader={isVarnish ? look : varnishShader(null)}
          varnishColor={NEUTRAL_VARNISH_COLOR}
          tuning={tuning}
          tilt={tilt}
          trackPointer
        />
      </div>
      <figcaption className="flex flex-col">
        <span className="text-[11px] font-medium">{lookId}</span>
        <span className="text-[10px] text-muted-foreground">
          {usingOwn ? sample!.name : "carte de secours"}
        </span>
        {showRecorded ? (
          <RecordedValues id={lookId as (typeof APP_HOLO_SHADER_IDS)[number]} />
        ) : null}
      </figcaption>
    </figure>
  );
}

export type FoilPlayroomProps = {
  /** Artwork and masks used wherever the collection has no card of that finish. */
  fallback: {
    imageUrl: string;
    maskUrl: string;
    varnishMaskUrl?: string | null;
  };
  /** Every foil copy in the collection, to match a look against its own print. */
  samples: readonly PlayroomSample[];
};

export function FoilPlayroom({ fallback, samples }: FoilPlayroomProps) {
  const [sourceKey, setSourceKey] = useState<"web" | "app" | "house">("web");
  const [tilt, setTilt] = useState(false);

  const source = SOURCES.find((entry) => entry.key === sourceKey) ?? SOURCES[0];

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

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4 text-xs">
        <p className="text-muted-foreground">
          {sourceKey === "app" ? (
            <>
              Chaque effet porte les <strong>valeurs enregistrées</strong> de
              son matériau, pas des réglages.
            </>
          ) : (
            <>Recettes telles quelles, sans réglage.</>
          )}{" "}
          Absents faute de médium :{" "}
          {NOT_PORTABLE.map((name) => (
            <code key={name} className="mr-1.5 text-[10px]">
              {name}
            </code>
          ))}
        </p>
        <label className="flex shrink-0 items-center gap-1.5">
          <input
            type="checkbox"
            checked={tilt}
            onChange={(event) => setTilt(event.target.checked)}
          />
          Inclinaison au survol
        </label>
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
              {ids.map((id) => (
                <LookTile
                  key={`${source.key}-${id}`}
                  lookId={id}
                  look={source.shaderOf(id)}
                  role={group.role}
                  sample={sampleForLook(id, samples)}
                  fallback={fallback}
                  tuning={
                    source.key === "app"
                      ? appRecordedTuning(
                          id as (typeof APP_HOLO_SHADER_IDS)[number],
                        )
                      : undefined
                  }
                  tilt={tilt}
                  showRecorded={source.key === "app"}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
