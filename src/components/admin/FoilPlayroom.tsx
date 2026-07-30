"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { FoilCardImage } from "@/components/FoilCardImage";
import type { FoilBackendPreference } from "@/core/render/foil";
import { setFoilPoolMax } from "@/core/render/foil";
import { listEffectPacks } from "@/effects";
import {
  peekPrintVariant,
  requestPrintVariant,
  subscribeToPrintVariants,
} from "@/lib/client/printVariantStore";
import {
  variantRendering,
  type VariantRendering,
} from "@/lib/client/hooks/usePrintVariant";
import { cn } from "@/lib/shared/utils";

/**
 * Bench for every dumped foil material, on the same face API as the shelves.
 *
 * Three backends, one component (`FoilCardImage`):
 * - **Auto** — product default (WebGL when compatible, else CSS)
 * - **Unity** — force WebGL
 * - **Web** — force CSS recipes
 */

export type PlayroomSample = {
  id: string;
  name: string;
  variant: string | null;
  printKey: string | null;
  shelfType: string | null;
  imageUrl: string | null;
};

const BACKENDS: readonly {
  key: FoilBackendPreference;
  label: string;
  hint: string;
}[] = [
  {
    key: "auto",
    label: "Auto",
    hint: "Comme la collection : WebGL (shaders app) dès que WebGL2 + matériau + slot pool le permettent, sinon recettes CSS.",
  },
  {
    key: "webgl",
    label: "Unity",
    hint: "Force les fragments dumpés de l'app (WebGL2). Sans WebGL2 ou hors budget pool → CSS.",
  },
  {
    key: "css",
    label: "Web",
    hint: "Force les recettes CSS du visualiseur (pack cssRecipes).",
  },
];

type AdaptedPrint = {
  sample: PlayroomSample;
  own: VariantRendering;
};

function useAdaptedPrint(
  candidates: readonly PlayroomSample[],
  opts: {
    wantedVarnish: string | null;
    requireFoilMask: boolean;
    requireVarnishMask: boolean;
  },
): AdaptedPrint | null {
  const { wantedVarnish, requireFoilMask, requireVarnishMask } = opts;

  useEffect(() => {
    for (const sample of candidates) {
      requestPrintVariant(sample.printKey, sample.shelfType);
    }
  }, [candidates]);

  const snapshotKey = useSyncExternalStore(
    subscribeToPrintVariants,
    () =>
      candidates
        .map((sample) => {
          const info = peekPrintVariant(sample.printKey, sample.shelfType);
          if (!info) return `${sample.id}:?`;
          return `${sample.id}:${info.varnishType ?? ""}:${info.foilMaskUrl ? 1 : 0}:${info.varnishMaskUrl ? 1 : 0}`;
        })
        .join("|"),
    () => "",
  );

  return useMemo(() => {
    void snapshotKey;
    let best: { print: AdaptedPrint; score: number } | null = null;
    for (const sample of candidates) {
      const info = peekPrintVariant(sample.printKey, sample.shelfType);
      const own = variantRendering(
        sample.variant,
        info,
        sample.imageUrl ?? null,
      );
      if (!own.imageUrl) continue;
      if (requireFoilMask && !own.foilMaskUrl) continue;
      if (requireVarnishMask && !own.varnishMaskUrl) continue;

      let score = 1;
      if (wantedVarnish) {
        if (
          info?.varnishType?.toLowerCase() !== wantedVarnish.toLowerCase()
        ) {
          continue;
        }
        score = 3;
      } else if (!info?.varnishType) {
        score = 2;
      }

      if (!best || score > best.score) {
        best = { print: { sample, own }, score };
      }
    }
    return best?.print ?? null;
  }, [
    candidates,
    requireFoilMask,
    requireVarnishMask,
    snapshotKey,
    wantedVarnish,
  ]);
}

function samplesForFinish(
  finish: string,
  samples: readonly PlayroomSample[],
): PlayroomSample[] {
  const wanted = finish.toLowerCase();
  const exact = samples.filter(
    (item) => item.variant?.toLowerCase() === wanted,
  );
  if (exact.length > 0) return exact;
  if (wanted === "freeform" || wanted === "freeform1") {
    return samples.filter(
      (item) => item.variant?.toLowerCase() === "freeform1",
    );
  }
  if (wanted === "freeform2") {
    return samples.filter(
      (item) => item.variant?.toLowerCase() === "freeform2",
    );
  }
  return [];
}

function materialHasRole(
  material: { textures: Record<string, { role?: string }> },
  role: "foilMask" | "varnishMask",
): boolean {
  return Object.values(material.textures).some(
    (binding) => binding.role === role,
  );
}

function MaterialTile({
  packId,
  materialName,
  samples,
  backend,
  tilt,
}: {
  packId: string;
  materialName: string;
  samples: readonly PlayroomSample[];
  backend: FoilBackendPreference;
  tilt: boolean;
}) {
  const pack = listEffectPacks().find((entry) => entry.id === packId);
  const material = pack?.material(materialName) ?? null;
  const { finish, varnish } = pack?.parseMaterialName?.(materialName) ?? {
    finish: null,
    varnish: null,
  };

  const candidates = useMemo(() => {
    if (!finish) return samples;
    return samplesForFinish(finish, samples);
  }, [finish, samples]);

  const adapted = useAdaptedPrint(candidates, {
    wantedVarnish: varnish,
    requireFoilMask: material ? materialHasRole(material, "foilMask") : true,
    requireVarnishMask: material
      ? materialHasRole(material, "varnishMask")
      : Boolean(varnish),
  });

  if (!adapted?.own.imageUrl) {
    return (
      <figure className="flex flex-col gap-1.5 opacity-40">
        <div className="aspect-[5/7] rounded-md border border-dashed border-border bg-muted/30" />
        <figcaption className="flex flex-col">
          <span className="text-[11px] font-medium">{materialName}</span>
          <span className="text-[10px] text-muted-foreground">
            Pas d&apos;exemplaire adapté
          </span>
        </figcaption>
      </figure>
    );
  }

  const { sample, own } = adapted;
  const artUrl = own.imageUrl;
  if (!artUrl) {
    return null;
  }

  return (
    <figure className="flex flex-col gap-1.5">
      <div
        className="aspect-[5/7] overflow-hidden rounded-md border border-border/60 bg-black"
        title={materialName}
      >
        <FoilCardImage
          effectPack={packId}
          imageUrl={artUrl}
          alt={materialName}
          materialName={materialName}
          finish={finish ?? own.finish}
          varnishType={varnish ?? own.varnishType}
          maskUrl={own.foilMaskUrl}
          varnishMaskUrl={own.varnishMaskUrl}
          secondVarnishMaskUrl={own.secondVarnishMaskUrl}
          varnishColor={own.varnishColor}
          secondVarnishColor={own.secondVarnishColor}
          backend={backend}
          tilt={tilt}
          trackPointer
        />
      </div>
      <figcaption className="flex flex-col">
        <span className="text-[11px] font-medium">{materialName}</span>
        <span className="text-[10px] text-muted-foreground">{sample.name}</span>
      </figcaption>
    </figure>
  );
}

export type FoilPlayroomProps = {
  samples: readonly PlayroomSample[];
};

export function FoilPlayroom({ samples }: FoilPlayroomProps) {
  const packs = listEffectPacks();
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const [backend, setBackend] = useState<FoilBackendPreference>("auto");
  const [tilt, setTilt] = useState(false);

  // Playroom shows every material at once — raise the WebGL budget so Unity
  // mode is not silently CSS for half the grid (collection keeps the default).
  useEffect(() => {
    setFoilPoolMax(24);
    return () => setFoilPoolMax(10);
  }, []);

  const pack = packs.find((entry) => entry.id === packId) ?? packs[0];
  const parseName = pack?.parseMaterialName;
  const materials = pack?.listMaterials() ?? [];
  const finishes = materials.filter(
    (name) => parseName?.(name).finish !== null,
  );
  const varnishes = materials.filter(
    (name) => parseName?.(name).finish === null,
  );
  const backendMeta =
    BACKENDS.find((entry) => entry.key === backend) ?? BACKENDS[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {packs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setPackId(entry.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              entry.id === pack?.id
                ? "border-primary bg-primary/10 font-semibold"
                : "border-border hover:bg-accent",
            )}
          >
            Pack {entry.id}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({entry.listMaterials().length})
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {BACKENDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setBackend(entry.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              entry.key === backend
                ? "border-primary bg-primary/10 font-semibold"
                : "border-border hover:bg-accent",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{backendMeta.hint}</p>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4 text-xs">
        <p className="text-muted-foreground">
          Même API que la collection (<code className="text-[10px]">FoilCardImage</code>
          ). Dump :{" "}
          <code className="text-[10px]">scripts/effects-dump</code>.
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

      {[
        {
          key: "finishes",
          title: "Matériaux de finition",
          hint: "Chaque matériau uniquement sur une carte qui porte sa finition — et son vernis quand le nom en encode un.",
          names: finishes,
        },
        {
          key: "varnishes",
          title: "Vernis seuls",
          hint: "Matériaux varnish-only de l'app — exemplaire avec masque de vernis requis.",
          names: varnishes,
        },
      ].map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {group.title}{" "}
              <span className="font-normal text-muted-foreground">
                ({group.names.length})
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">{group.hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {group.names.map((name) => (
              <MaterialTile
                key={name}
                packId={pack?.id ?? packId}
                materialName={name}
                samples={samples}
                backend={backend}
                tilt={tilt}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
