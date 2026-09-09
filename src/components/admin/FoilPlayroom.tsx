"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, MousePointer2 } from "lucide-react";

import {
  FoilPackSources,
  foilExtractTargetForPack,
} from "@/components/admin/FoilSourcesPanel";
import { CatalogueBrowser } from "@/components/admin/CatalogueBrowser";
import { CatalogueSealedBrowser } from "@/components/admin/CatalogueSealedBrowser";
import { OpenInLiveButton } from "@/components/admin/OpenInLiveButton";
import { FoilCardImage } from "@/components/FoilCardImage";
import type { FoilBackendPreference } from "@/core/render/foil";
import { clearFoilPool, setFoilPoolMax } from "@/core/render/foil";
import { listEffectPacks } from "@/effects";
import { SegmentedControl } from "@/components/admin/SegmentedControl";
import type { PlayroomArt } from "@/effects/pokemon/playroomArt";
import {
  simeyDemoUrl,
  simeyIsoForLeaf,
} from "@/effects/pokemon/simeyIsoCompare";
import {
  CATALOGUE_PACKS,
  cataloguePackInfo,
  resolveCataloguePackId,
  resolveCatalogueScope,
  type CatalogueBrowseScope,
  type CataloguePackId,
} from "@/lib/admin/cataloguePacks";
import { useOptimisticUrlValue } from "@/lib/client/useOptimisticUrlValue";
import { hydrateFoilMetaFromAssets } from "@/lib/foilMetaLoad";
import {
  peekPrintVariant,
  requestPrintVariant,
  subscribeToPrintVariants,
} from "@/lib/client/printVariantStore";
import {
  variantRendering,
  type PrintVariantInfo,
  type VariantRendering,
} from "@/lib/client/hooks/usePrintVariant";

import { Switch } from "@/components/ui/switch";
import { OrientedMediaFrame } from "@/components/OrientedMediaFrame";
import { cn } from "@/lib/shared/utils";
import { getAspectRatio } from "@/lib/text/cardFormat";

/**
 * Bench for every dumped foil material, on the same face API as the shelves.
 *
 * Three backends, one component (`FoilCardImage`):
 * - **Auto** — product default (WebGL when compatible, else CSS)
 * - **Unity** — force WebGL
 * - **Web** — force CSS recipes
 *
 * Three layouts:
 * - **Grid** — overview of every material (pool-capped WebGL)
 * - **Carte** — one material at a time so the WebGL context is fresh and alone
 * - **Comparer** — the same card twice, Unity beside CSS, to see what the web
 *   adaptation drops. The backend toggle is meaningless here and says so: both
 *   sides are pinned, or the comparison would compare nothing.
 */

export type PlayroomSample = {
  id: string;
  name: string;
  variant: string | null;
  printKey: string | null;
  shelfType: string | null;
  imageUrl: string | null;
  /** Catalogue / collection masks — prefer these so Unity does not wait. */
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  varnishType?: string | null;
  varnishColor?: string | null;
  secondVarnishColor?: string | null;
  effectPack?: string | null;
};

/** Old URL / bookmark aliases → current pack id. */
const PACK_SLUG_ALIASES: Record<string, string> = {
  pokemonpaper: "pokemon",
};

/**
 * Match a URL segment against the registered pack ids — a short prefix can
 * resolve the full id when it is unambiguous. Ambiguous prefixes resolve to
 * nothing rather than to a coin flip.
 */
export function resolveEffectPackId(
  slug: string | null | undefined,
  ids: readonly string[],
): string | null {
  let wanted = normalizePackSlug(slug ?? "");
  if (!wanted) return null;
  wanted = PACK_SLUG_ALIASES[wanted] ?? wanted;
  const normalized = ids.map((id) => [id, normalizePackSlug(id)] as const);
  const exact = normalized.find(([, id]) => id === wanted);
  if (exact) return exact[0];
  const prefixed = normalized.filter(([, id]) => id.startsWith(wanted));
  return prefixed.length === 1 ? prefixed[0]![0] : null;
}

function normalizePackSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type PlayroomLayout = "grid" | "focus" | "compare";

/**
 * Resolve a material name from the URL against the pack's dumped list —
 * exact match first, then case-insensitive. Unknown / empty → first material
 * (or null when the pack has none).
 */
export function resolvePlayroomMaterial(
  slug: string | null | undefined,
  materials: readonly string[],
): string | null {
  if (materials.length === 0) return null;
  if (!slug) return materials[0] ?? null;
  const exact = materials.find((name) => name === slug);
  if (exact) return exact;
  const lower = slug.toLowerCase();
  return (
    materials.find((name) => name.toLowerCase() === lower) ?? materials[0]!
  );
}

export function resolvePlayroomLayout(
  value: string | null | undefined,
): PlayroomLayout {
  if (value === "compare" || value === "comparer") return "compare";
  return value === "focus" || value === "carte" || value === "card"
    ? "focus"
    : "grid";
}

const BACKENDS: readonly {
  key: FoilBackendPreference;
  labelFr: string;
  labelEn: string;
}[] = [
  {
    key: "auto",
    labelFr: "Auto",
    labelEn: "Auto",
  },
  {
    key: "webgl",
    labelFr: "Unity",
    labelEn: "Unity",
  },
  {
    key: "css",
    labelFr: "Web",
    labelEn: "Web",
  },
];

/** Sum of padding-bottom on ancestors (admin shell pb + content p-*). */
function ancestorBottomPad(el: HTMLElement): number {
  let pad = 0;
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.documentElement) {
    pad += parseFloat(getComputedStyle(node).paddingBottom) || 0;
    node = node.parentElement;
  }
  return pad;
}

/**
 * Pin an element’s height to the remaining viewport below its top edge so
 * focus mode can fit the card without page scroll.
 */
function useFillViewportBelow<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      if (el) el.style.height = "";
      return;
    }
    const sync = () => {
      const top = el.getBoundingClientRect().top;
      const bottom = ancestorBottomPad(el) + 12;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      el.style.height = `${Math.max(180, Math.floor(vh - top - bottom))}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(document.documentElement);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      el.style.height = "";
    };
  }, [active]);
  return ref;
}

const LAYOUTS: readonly {
  key: PlayroomLayout;
  labelFr: string;
  labelEn: string;
}[] = [
  { key: "grid", labelFr: "Grille", labelEn: "Grid" },
  { key: "focus", labelFr: "Carte", labelEn: "Card" },
  { key: "compare", labelFr: "Comparer", labelEn: "Compare" },
];

/**
 * The two sides of the comparison, pinned.
 *
 * Not the user's backend choice: a side-by-side whose halves could both be
 * WebGL compares nothing. `auto` is deliberately absent for the same reason.
 */
const COMPARE_SIDES_UNITY: readonly {
  backend: FoilBackendPreference;
  labelFr: string;
  labelEn: string;
}[] = [
  { backend: "webgl", labelFr: "Unity", labelEn: "Unity" },
  { backend: "css", labelFr: "Placarr CSS", labelEn: "Placarr CSS" },
];

/** ISO pair: our CSS vs Simey’s live demo (same rarity recipe). */
export type ComparePair = "unity" | "simey";

function resolveComparePair(value: string | null): ComparePair {
  if (value === "simey" || value === "iso" || value === "css-simey") {
    return "simey";
  }
  return "unity";
}

type AdaptedPrint = {
  sample: PlayroomSample;
  own: VariantRendering;
};

/** Cap how many prints we resolve per material — enough to find a mask, not the whole set. */
const PRINT_RESOLVE_CAP = 12;

/** @internal exported for unit tests */
export function printInfoFromSample(
  sample: PlayroomSample,
  info: PrintVariantInfo | null,
): PrintVariantInfo | null {
  const sampleVariant = sample.variant?.trim().toLowerCase() ?? "";
  if (info) {
    const finishes = [...(info.finishes ?? [])];
    if (
      sampleVariant &&
      !finishes.some((finish) => finish.trim().toLowerCase() === sampleVariant)
    ) {
      // Playroom material (Kayou hr-2x2…) vs collection finish axis (hr).
      finishes.push(sample.variant!.trim());
    }
    return {
      ...info,
      finishes,
      foilMaskUrl: info.foilMaskUrl ?? sample.foilMaskUrl ?? null,
      varnishMaskUrl: info.varnishMaskUrl ?? sample.varnishMaskUrl ?? null,
      secondVarnishMaskUrl:
        info.secondVarnishMaskUrl ?? sample.secondVarnishMaskUrl ?? null,
      varnishType: info.varnishType ?? sample.varnishType ?? null,
      varnishColor: info.varnishColor ?? sample.varnishColor ?? null,
      secondVarnishColor:
        info.secondVarnishColor ?? sample.secondVarnishColor ?? null,
      effectPack: info.effectPack ?? sample.effectPack ?? null,
    };
  }
  if (!sample.printKey) return null;
  return {
    finishes: sample.variant ? [sample.variant] : [],
    plainFinishes: [],
    foilMaskUrl: sample.foilMaskUrl ?? null,
    varnishMaskUrl: sample.varnishMaskUrl ?? null,
    secondVarnishMaskUrl: sample.secondVarnishMaskUrl ?? null,
    varnishType: sample.varnishType ?? null,
    varnishColor: sample.varnishColor ?? null,
    secondVarnishColor: sample.secondVarnishColor ?? null,
    effectPack: sample.effectPack ?? null,
  };
}

function useAdaptedPrint(
  candidates: readonly PlayroomSample[],
  opts: {
    wantedVarnish: string | null;
    requireFoilMask: boolean;
    requireVarnishMask: boolean;
  },
): AdaptedPrint | null {
  const { wantedVarnish, requireFoilMask, requireVarnishMask } = opts;
  const resolvePool = useMemo(() => {
    // Catalogue samples often carry foilMaskUrl already; collection rows need a
    // print-variant round-trip. Prefer masked samples so Unity is not blocked
    // by the first N owned copies waiting on the network.
    const ranked = [...candidates].sort((a, b) => {
      const aMask = a.foilMaskUrl ? 1 : 0;
      const bMask = b.foilMaskUrl ? 1 : 0;
      if (aMask !== bMask) return bMask - aMask;
      const aVarnish = a.varnishMaskUrl ? 1 : 0;
      const bVarnish = b.varnishMaskUrl ? 1 : 0;
      return bVarnish - aVarnish;
    });
    return ranked.slice(0, PRINT_RESOLVE_CAP);
  }, [candidates]);

  useEffect(() => {
    for (const sample of resolvePool) {
      requestPrintVariant(sample.printKey, sample.shelfType);
    }
  }, [resolvePool]);

  const snapshotKey = useSyncExternalStore(
    subscribeToPrintVariants,
    () =>
      resolvePool
        .map((sample) => {
          const info = peekPrintVariant(sample.printKey, sample.shelfType);
          if (!info && !sample.foilMaskUrl) return `${sample.id}:?`;
          const varnish = info?.varnishType ?? sample.varnishType ?? "";
          const foil = info?.foilMaskUrl || sample.foilMaskUrl ? 1 : 0;
          const varnishMask =
            info?.varnishMaskUrl || sample.varnishMaskUrl ? 1 : 0;
          return `${sample.id}:${varnish}:${foil}:${varnishMask}`;
        })
        .join("|"),
    () => "",
  );

  return useMemo(() => {
    void snapshotKey;
    let best: { print: AdaptedPrint; score: number } | null = null;
    for (const sample of resolvePool) {
      const info = peekPrintVariant(sample.printKey, sample.shelfType);
      const resolved = variantRendering(
        sample.variant,
        printInfoFromSample(sample, info),
        sample.imageUrl ?? null,
      );
      if (!resolved.imageUrl) continue;
      if (requireFoilMask && !resolved.foilMaskUrl) continue;
      if (requireVarnishMask && !resolved.varnishMaskUrl) continue;

      let score = 1;
      if (wantedVarnish) {
        if (
          (info?.varnishType ?? sample.varnishType)?.toLowerCase() !==
          wantedVarnish.toLowerCase()
        ) {
          continue;
        }
        score = 3;
      } else if (!(info?.varnishType ?? sample.varnishType)) {
        score = 2;
      }

      if (!best || score > best.score) {
        best = { print: { sample, own: resolved }, score };
      }
    }
    return best?.print ?? null;
  }, [
    requireFoilMask,
    requireVarnishMask,
    resolvePool,
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
  role: "foilMask" | "varnishMask" | "secondVarnishMask",
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
  locale,
  size = "grid",
  onFocus,
  /** Pin a specific Live face (compare/focus stack). Grid omits → seed only. */
  packArt: packArtProp,
}: {
  packId: string;
  materialName: string;
  samples: readonly PlayroomSample[];
  backend: FoilBackendPreference;
  tilt: boolean;
  locale: string;
  /** `stack` = focus-sized card in a vertical list (no flex-1 fill). */
  size?: "grid" | "focus" | "stack";
  /** Grid → focus: click the tile to isolate this material. */
  onFocus?: (materialName: string) => void;
  packArt?: {
    imageUrl: string;
    maskUrl?: string | null;
    varnishMaskUrl?: string | null;
    secondVarnishMaskUrl?: string | null;
    foilMask?: string | null;
    bundleId?: string | null;
    label?: string | null;
    faceQuarterTurns?: 0 | 1 | 2 | 3;
    cardGlow?: string | null;
    liveOwned?: boolean;
  } | null;
}) {
  const fr = locale === "fr";
  const pack = listEffectPacks().find((entry) => entry.id === packId);
  const material = pack?.material(materialName) ?? null;
  const { finish, varnish } = pack?.parseMaterialName?.(materialName) ?? {
    finish: null,
    varnish: null,
  };

  const candidates = !finish
    ? (() => {
        // Varnish-only: prefer prints that already carry a varnish mask. Do not
        // slice the collection-first list — that hid catalogue fillers.
        const withVarnishMask = samples.filter(
          (sample) => sample.imageUrl && sample.varnishMaskUrl,
        );
        if (withVarnishMask.length > 0) return withVarnishMask;
        return samples.filter((sample) => Boolean(sample.imageUrl));
      })()
    : samplesForFinish(finish, samples);

  const packArt =
    packArtProp !== undefined
      ? packArtProp
      : pack?.playroomArtForMaterial?.(materialName);
  const liveOwned = Boolean(packArt?.liveOwned);
  const adapted = useAdaptedPrint(candidates, {
    wantedVarnish: varnish,
    requireFoilMask: material ? materialHasRole(material, "foilMask") : true,
    requireVarnishMask: material
      ? materialHasRole(material, "varnishMask")
      : Boolean(varnish),
  });

  const needsVarnishMask = material
    ? materialHasRole(material, "varnishMask")
    : Boolean(varnish);
  const needsSecondVarnishMask = material
    ? materialHasRole(material, "secondVarnishMask")
    : false;

  const artUrl = packArt?.imageUrl ?? adapted?.own.imageUrl ?? null;
  const focus = size === "focus" || size === "stack";
  const stack = size === "stack";
  const faceQuarterTurns = packArt?.faceQuarterTurns ?? 0;
  const baseAspect = getAspectRatio("tcg", "tcg");
  const cssForMaterial = pack?.resolveCss?.(
    finish ?? materialName,
    varnish ?? null,
  );
  const lenticularLandscapeFace = cssForMaterial?.landscapeFace === true;
  const captionClass = focus
    ? "text-sm font-medium leading-tight"
    : "truncate text-[11px] font-medium leading-tight";
  const subCaptionClass = focus
    ? "text-xs text-muted-foreground"
    : "truncate text-[10px] text-muted-foreground";
  const liveBundleId = packArt?.bundleId?.trim() || null;
  const liveOpen =
    liveOwned && liveBundleId ? (
      <OpenInLiveButton
        bundleId={liveBundleId}
        material={materialName}
        locale={locale}
        className={focus ? "items-center" : undefined}
      />
    ) : null;

  const cardFrame = (children: ReactNode) => (
    <OrientedMediaFrame
      aspectRatio={baseAspect}
      faceQuarterTurns={faceQuarterTurns}
      landscapeFace={lenticularLandscapeFace}
      // `contain` needs a parent with height (single focus stage). Stacked
      // faces live in a scroll column with no fixed height — `contain` then
      // resolves to 0×0 and the captions float over empty space.
      fit={size === "focus" ? "contain" : "fill-width"}
      className={cn(
        // No radius / overflow / border here — they belong on the foil face so
        // they tilt with the card (see FoilCardImage `className` below).
        !artUrl &&
          "overflow-hidden rounded-lg border border-dashed border-border/80 bg-muted/20",
      )}
    >
      <div className="h-full w-full" title={materialName}>
        {children}
      </div>
    </OrientedMediaFrame>
  );

  const focusShell = (body: ReactNode, caption: ReactNode) => (
    <figure
      className={cn(
        "group flex flex-col gap-2",
        !artUrl && "opacity-45",
        size === "focus"
          ? "mx-auto h-full min-h-0 w-full max-w-full items-center gap-1.5"
          : stack
            ? "mx-auto w-full max-w-[min(100%,280px)] items-center gap-1.5"
            : undefined,
      )}
    >
      {size === "focus" ? (
        <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
          {body}
        </div>
      ) : (
        body
      )}
      <figcaption className={cn("min-w-0 shrink-0", focus && "text-center")}>
        {caption}
      </figcaption>
    </figure>
  );

  if (!artUrl) {
    return focusShell(
      cardFrame(null),
      <>
        <p className={captionClass}>{materialName}</p>
        <p className={subCaptionClass}>
          {fr ? "Pas d’exemplaire" : "No matching print"}
        </p>
      </>,
    );
  }

  const own = adapted?.own;
  const sample = adapted?.sample;

  return focusShell(
    cardFrame(
      <FoilCardImage
        effectPack={packId}
        imageUrl={artUrl}
        alt={materialName}
        className={cn(
          // Soft chrome on this node so radius tilts with the face
          // (OrientedMediaFrame stays radius-free when art is present).
          //
          // No backdrop colour here. `bg-zinc-950` used to sit on this node and
          // the card is what tilts: rotating the face in 3D swung it off the
          // plate underneath, so a black rim appeared along the leading edges
          // the moment the pointer moved. The artwork is opaque and fills the
          // frame, so the plate was only ever visible when it was wrong.
          "rounded-lg shadow-sm transition-shadow group-hover:shadow-md",
          focus && "shadow-lg",
        )}
        materialName={materialName}
        liveFoilMask={
          material?.webgl === false ? null : (packArt?.foilMask ?? null)
        }
        finish={
          finish ??
          (material?.webgl === false ? materialName : own?.finish ?? materialName)
        }
        // Only pass varnish from the material under test — not from a random
        // adapted print that happens to carry a varnish coat.
        varnishType={material?.webgl === false ? null : varnish}
        /*
          Same rule as the plates below, and for the same reason: the foil mask
          describes *this* print's foiled areas. Preferring the adapted print
          put another card's mask over the displayed art — every Pokémon sample
          wore `swsh7-5_wp_fr_009` while its own `…_wp_…` sat unused on disk.
        */
        maskUrl={
          material?.webgl === false
            ? null
            : (packArt?.maskUrl ??
              own?.foilMaskUrl ??
              pack?.fallbackFoilMaskUrl ??
              null)
        }
        /*
          Ultra Gold / Scodix / SwSecret: full-card + raw `--foil-etch`.
          Radiant: invert etch → mask + paint.
        */
        foilPlateUrl={
          packArt?.secondVarnishMaskUrl ?? own?.secondVarnishMaskUrl ?? null
        }
        // Plates are engravings of a specific print — when the pack supplies
        // the art, its plates must ride along (not another card's).
        varnishMaskUrl={
          needsVarnishMask
            ? (packArt?.varnishMaskUrl ?? own?.varnishMaskUrl ?? null)
            : null
        }
        secondVarnishMaskUrl={
          needsSecondVarnishMask
            ? (packArt?.secondVarnishMaskUrl ??
              own?.secondVarnishMaskUrl ??
              null)
            : null
        }
        varnishColor={needsVarnishMask ? (own?.varnishColor ?? null) : null}
        secondVarnishColor={
          needsSecondVarnishMask ? (own?.secondVarnishColor ?? null) : null
        }
        cardGlow={packArt?.cardGlow ?? null}
        backend={backend}
        tilt={tilt}
        trackPointer
      />,
    ),
    <div
      className={cn(
        "flex w-full gap-2",
        focus ? "flex-col items-center" : "items-start justify-between",
      )}
    >
      {onFocus ? (
        <button
          type="button"
          onClick={() => onFocus(materialName)}
          className="min-w-0 flex-1 text-left transition-colors hover:text-foreground"
        >
          <p className={captionClass}>{materialName}</p>
          <p className={subCaptionClass}>
            {packArt?.label ?? sample?.name ?? finish ?? "—"}
            {!liveOwned ? (
              <span className="ml-1 text-muted-foreground/70">
                · {fr ? "inspecter" : "inspect"}
              </span>
            ) : null}
          </p>
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <p className={captionClass}>{materialName}</p>
          <p className={subCaptionClass}>
            {packArt?.label ?? sample?.name ?? finish ?? "—"}
          </p>
        </div>
      )}
      {liveOpen}
    </div>,
  );
}

export type FoilPlayroomProps = {
  samples: readonly PlayroomSample[];
  /**
   * Live faces per pack and material, resolved on the server.
   *
   * The pack cannot answer this in the browser any more: the per-print dump
   * lives in SQLite, which has no browser build. Absent (tests, older callers)
   * the component falls back to asking the pack, which simply yields the
   * TCGdex seed with no Live mask.
   */
  packArts?: Record<string, Record<string, PlayroomArt[]>>;
  locale?: string;
  /** Franchise + ligne — left side of the sticky Catalogue bar. */
  chromeLeading?: ReactNode;
  /**
   * Controlled catalogue line. When set (Catalogue tab), pack switches are
   * optimistic and must not wait for `?pack=` / searchParams.
   */
  cataloguePackId?: CataloguePackId;
};

function SimeyIsoCompareRow({
  fr,
  leaf,
  tilt,
  locale,
  packId,
  samples,
  art,
}: {
  fr: boolean;
  leaf: string;
  tilt: boolean;
  locale: string;
  packId: string;
  samples: readonly PlayroomSample[];
  art: PlayroomArt | null;
}) {
  const target = simeyIsoForLeaf(leaf);
  const demoUrl = target ? simeyDemoUrl(target) : null;
  return (
    <div className="flex flex-col gap-3">
      {target ? (
        <p className="mx-auto max-w-3xl text-center text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {target.stem}.css
          </span>
          {" · "}
          {target.demoPick}
          {" · "}
          {target.check}
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {fr
            ? "Pas de cible Simey pour ce leaf."
            : "No Simey ISO target for this leaf."}
        </p>
      )}
      <div className="grid shrink-0 grid-cols-2 gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Placarr CSS
            {target ? ` · ${target.cssId}` : ""}
          </span>
          <div className="flex w-full items-center justify-center">
            <MaterialTile
              packId={packId}
              materialName={leaf}
              samples={samples}
              backend="css"
              tilt={tilt}
              locale={locale}
              size="stack"
              packArt={art}
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            Simey · {target?.tree ?? "—"}
          </span>
          {demoUrl ? (
            <div className="flex w-full flex-col items-center gap-2">
              <iframe
                title={`Simey ${target!.stem}`}
                src={demoUrl}
                className="h-[min(70vh,640px)] w-full max-w-[420px] rounded-md border border-border/60 bg-background"
              />
              <a
                href={demoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                {fr ? "Ouvrir Simey ↗" : "Open Simey ↗"} — {target!.demoSearch}
              </a>
              <p className="max-w-sm text-center text-[11px] text-muted-foreground">
                {fr
                  ? "Dans l’iframe : clique la carte indiquée ci-dessus, bouge la souris. Compare grain / taille foil / blends."
                  : "In the iframe: expand the card named above, move the pointer. Compare grain / foil size / blends."}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FoilPlayroom({
  samples,
  packArts,
  locale = "fr",
  chromeLeading,
  cataloguePackId: cataloguePackIdProp,
}: FoilPlayroomProps) {
  const fr = locale === "fr";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [metaReady, setMetaReady] = useState(typeof window === "undefined");
  useEffect(() => {
    let cancelled = false;
    void hydrateFoilMetaFromAssets().finally(() => {
      if (!cancelled) setMetaReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const packs = listEffectPacks();
  const packFromUrl =
    resolveCataloguePackId(searchParams.get("pack")) ?? CATALOGUE_PACKS[0]!.id;
  const cataloguePackId: CataloguePackId =
    cataloguePackIdProp ?? packFromUrl;
  /** URL still on the previous pack while the parent already switched. */
  const urlPackInSync = packFromUrl === cataloguePackId;
  const catalogueInfo =
    cataloguePackInfo(cataloguePackId) ?? CATALOGUE_PACKS[0]!;

  const urlBrowseScope: CatalogueBrowseScope = resolveCatalogueScope(
    urlPackInSync ? searchParams.get("scope") : null,
    catalogueInfo,
  );
  const {
    value: browseScope,
    setOptimistic: setBrowseScopeOptimistic,
    clearOptimistic: clearBrowseScopeOptimistic,
  } = useOptimisticUrlValue(urlBrowseScope);

  const urlLayout = resolvePlayroomLayout(
    urlPackInSync ? searchParams.get("view") : null,
  );
  const {
    value: layout,
    setOptimistic: setLayoutOptimistic,
    clearOptimistic: clearLayoutOptimistic,
  } = useOptimisticUrlValue(urlLayout);

  const urlComparePair = resolveComparePair(
    urlPackInSync ? searchParams.get("pair") : null,
  );
  const {
    value: comparePair,
    setOptimistic: setComparePairOptimistic,
    clearOptimistic: clearComparePairOptimistic,
  } = useOptimisticUrlValue(urlComparePair);

  useLayoutEffect(() => {
    clearBrowseScopeOptimistic();
    clearLayoutOptimistic();
    clearComparePairOptimistic();
  }, [
    cataloguePackId,
    clearBrowseScopeOptimistic,
    clearLayoutOptimistic,
    clearComparePairOptimistic,
  ]);

  const showFoilPlayroom =
    catalogueInfo.hasFoilEffects && browseScope === "foils";
  /** Effect-pack id (may differ from catalogue path, e.g. naruto/kayou → naruto-kayou). */
  const packId =
    resolveEffectPackId(
      cataloguePackId,
      packs.map((entry) => entry.id),
    ) ??
    resolveEffectPackId(
      catalogueInfo.extractTarget,
      packs.map((entry) => entry.id),
    ) ??
    cataloguePackId;
  /**
   * Live faces for a material: server-resolved when the prop is there, else the
   * pack — which in the browser can only offer the TCGdex seed.
   */
  const artsFor = useCallback(
    (name: string): PlayroomArt[] => {
      const fromServer = packArts?.[packId]?.[name];
      if (fromServer && fromServer.length > 0) return fromServer;
      const pack = packs.find((entry) => entry.id === packId);
      const list = pack?.playroomArtsForMaterial?.(name);
      if (list && list.length > 0) return list;
      const one = pack?.playroomArtForMaterial?.(name);
      return one ? [one] : [];
    },
    [packArts, packId, packs],
  );

  const [backend, setBackend] = useState<FoilBackendPreference>("auto");
  const [tilt, setTilt] = useState(true);

  const pack = packs.find((entry) => entry.id === packId) ?? null;
  const extractTarget = foilExtractTargetForPack(cataloguePackId);
  // Re-read after foil-meta hydrate (manifest / frag-stems).
  const materials = useMemo(() => {
    void metaReady;
    return pack?.listMaterials() ?? [];
  }, [pack, metaReady]);
  /** Owned Live faces first so MuMu-checkable effects are easy to find. */
  const materialsOrdered = useMemo(() => {
    if (!pack) return materials;
    const owned: string[] = [];
    const rest: string[] = [];
    for (const name of materials) {
      if (artsFor(name)[0]?.liveOwned) owned.push(name);
      else rest.push(name);
    }
    return [...owned, ...rest];
  }, [materials, pack, artsFor]);
  const urlFocusedMaterial = resolvePlayroomMaterial(
    urlPackInSync ? searchParams.get("material") : null,
    materialsOrdered,
  );
  const {
    value: focusedMaterial,
    setOptimistic: setMaterialOptimistic,
    clearOptimistic: clearMaterialOptimistic,
  } = useOptimisticUrlValue(urlFocusedMaterial);

  useLayoutEffect(() => {
    clearMaterialOptimistic();
  }, [cataloguePackId, clearMaterialOptimistic]);

  const focusIndex = focusedMaterial
    ? Math.max(0, materialsOrdered.indexOf(focusedMaterial))
    : 0;

  /**
   * Focus/compare: several Live faces for the material (seed + other sets).
   * Grid keeps a single seed tile so the wall stays readable.
   */
  const focusedArts = useMemo(
    () => (focusedMaterial ? artsFor(focusedMaterial) : []),
    [focusedMaterial, artsFor],
  );

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      if (!params.get("tab")) params.set("tab", "catalogue");
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const selectScope = useCallback(
    (next: CatalogueBrowseScope) => {
      setBrowseScopeOptimistic(next);
      if (next !== "foils") {
        setLayoutOptimistic("grid");
        setMaterialOptimistic(null);
      }
      replaceParams((params) => {
        if (next === "foils") {
          params.delete("scope");
        } else if (next === "sealed") {
          params.set("scope", "sealed");
          params.delete("material");
          params.delete("view");
        } else {
          params.set("scope", "all");
          params.delete("material");
          params.delete("view");
        }
      });
    },
    [
      replaceParams,
      setBrowseScopeOptimistic,
      setLayoutOptimistic,
      setMaterialOptimistic,
    ],
  );

  const selectLayout = useCallback(
    (next: PlayroomLayout) => {
      setLayoutOptimistic(next);
      if (next === "grid") {
        setMaterialOptimistic(null);
      } else if (!focusedMaterial && materialsOrdered[0]) {
        setMaterialOptimistic(materialsOrdered[0]);
      }
      replaceParams((params) => {
        if (next === "grid") {
          params.delete("view");
          params.delete("material");
        } else {
          // Write the layout actually asked for — hardcoding "focus" here sent
          // every non-grid choice to the single-card view, so "Comparer" opened
          // "Carte".
          params.set("view", next);
          if (!params.get("material") && materialsOrdered[0]) {
            params.set("material", materialsOrdered[0]);
          }
        }
      });
    },
    [
      focusedMaterial,
      materialsOrdered,
      replaceParams,
      setLayoutOptimistic,
      setMaterialOptimistic,
    ],
  );

  const selectComparePair = useCallback(
    (next: ComparePair) => {
      setComparePairOptimistic(next);
      setLayoutOptimistic("compare");
      replaceParams((params) => {
        if (next === "unity") params.delete("pair");
        else params.set("pair", "simey");
        if (resolvePlayroomLayout(params.get("view")) !== "compare") {
          params.set("view", "compare");
        }
      });
    },
    [replaceParams, setComparePairOptimistic, setLayoutOptimistic],
  );

  const selectMaterial = useCallback(
    (name: string) => {
      setMaterialOptimistic(name);
      if (layout !== "compare") {
        setLayoutOptimistic("focus");
      }
      replaceParams((params) => {
        // Keep the comparison open when stepping through materials inside it.
        if (resolvePlayroomLayout(params.get("view")) !== "compare") {
          params.set("view", "focus");
        }
        params.set("material", name);
      });
    },
    [layout, replaceParams, setLayoutOptimistic, setMaterialOptimistic],
  );

  const stepMaterial = useCallback(
    (delta: number) => {
      if (materialsOrdered.length === 0) return;
      const next =
        materialsOrdered[
          (focusIndex + delta + materialsOrdered.length) %
            materialsOrdered.length
        ]!;
      selectMaterial(next);
    },
    [focusIndex, materialsOrdered, selectMaterial],
  );

  const focusStageRef = useFillViewportBelow<HTMLDivElement>(layout !== "grid");

  useEffect(() => {
    // Warm Frida navd in the background so Live opens hit the hot attach.
    void fetch("/api/admin/live-open").catch(() => {});
  }, []);

  useEffect(() => {
    // Focus mounts a single card — pool of 1 keeps the WebGL context exclusive.
    // Clear first so leftover grid holders cannot starve the only canvas.
    // Grid keeps a small shared pool so overview tiles can still try Unity.
    clearFoilPool();
    // Compare shows one WebGL half, so it needs a slot of its own — the grid
    // is the only layout that wants many.
    setFoilPoolMax(layout === "grid" ? 8 : 1);
    return () => setFoilPoolMax(10);
  }, [layout]);

  // Arrow keys step materials in focus mode (ignore when typing in a field).
  useEffect(() => {
    if (layout !== "focus") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepMaterial(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepMaterial(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, stepMaterial]);

  return (
    <div className="flex flex-col gap-2">
      <div className="sticky top-14 z-30 -mx-1 flex flex-col gap-2 bg-background/95 px-1 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-2">
          {chromeLeading}
          {extractTarget && (layout === "grid" || !showFoilPlayroom) ? (
            <FoilPackSources
              target={extractTarget}
              locale={locale}
              layout="toolbar"
            />
          ) : null}
        </div>
      </div>
      <SegmentedControl<CatalogueBrowseScope>
        value={
          browseScope === "sealed"
            ? "sealed"
            : catalogueInfo.hasFoilEffects
              ? browseScope
              : "all"
        }
        onChange={selectScope}
        options={[
          ...(catalogueInfo.hasFoilEffects
            ? [
                {
                  value: "foils" as const,
                  label: fr ? "Foils" : "Foils",
                },
              ]
            : []),
          {
            value: "all",
            label: fr ? "Cartes" : "Cards",
          },
          {
            value: "sealed",
            label: fr ? "Scellés" : "Sealed",
          },
        ]}
      />

      {browseScope === "sealed" ? (
        <CatalogueSealedBrowser packId={cataloguePackId} locale={locale} />
      ) : !showFoilPlayroom ? (
        <CatalogueBrowser packId={cataloguePackId} locale={locale} />
      ) : materials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fr
            ? "Aucun matériau dumpé pour ce pack."
            : "No dumped materials for this pack."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={layout}
              onChange={selectLayout}
              options={LAYOUTS.map((entry) => ({
                value: entry.key,
                label: fr ? entry.labelFr : entry.labelEn,
              }))}
            />
            {/* Comparing pins both halves, so this control would be a lie. */}
            <SegmentedControl
              value={backend}
              onChange={setBackend}
              disabled={layout === "compare"}
              options={BACKENDS.map((entry) => ({
                value: entry.key,
                label: fr ? entry.labelFr : entry.labelEn,
              }))}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={tilt}
                onCheckedChange={setTilt}
                aria-label={fr ? "Inclinaison" : "Tilt"}
              />
              <span className="inline-flex items-center gap-1">
                <MousePointer2 className="h-3.5 w-3.5" />
                {fr ? "Inclinaison" : "Tilt"}
              </span>
            </label>
            {layout === "focus" ? (
              <p className="text-xs text-muted-foreground">
                {focusedArts.length > 1
                  ? fr
                    ? `${focusedArts.length} faces empilées · même effet · ← →`
                    : `${focusedArts.length} stacked faces · same effect · ← →`
                  : fr
                    ? "Une carte · contexte WebGL dédié · ← →"
                    : "One card · dedicated WebGL context · ← →"}
              </p>
            ) : null}
            {layout === "compare" ? (
              <>
                {(pack?.id ?? packId) === "pokemon" ? (
                  <SegmentedControl
                    value={comparePair}
                    onChange={selectComparePair}
                    options={[
                      {
                        value: "unity" as const,
                        label: fr ? "Unity | CSS" : "Unity | CSS",
                      },
                      {
                        value: "simey" as const,
                        label: fr ? "CSS | Simey" : "CSS | Simey",
                      },
                    ]}
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {comparePair === "simey" && (pack?.id ?? packId) === "pokemon"
                    ? fr
                      ? `ISO Simey · ${focusedArts.length} face${focusedArts.length > 1 ? "s" : ""} · agrandis la bonne rareté chez eux`
                      : `Simey ISO · ${focusedArts.length} face${focusedArts.length > 1 ? "s" : ""} · expand the matching rarity on their demo`
                    : fr
                      ? `Plusieurs cartes · Unity | CSS · ${focusedArts.length} face${focusedArts.length > 1 ? "s" : ""}`
                      : `Several cards · Unity | CSS · ${focusedArts.length} face${focusedArts.length > 1 ? "s" : ""}`}
                </p>
              </>
            ) : null}
          </div>

          {layout !== "grid" && focusedMaterial ? (
            <div
              ref={focusStageRef}
              className="flex min-h-0 flex-col gap-2 overflow-hidden"
            >
              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => stepMaterial(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={fr ? "Matériau précédent" : "Previous material"}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="sr-only">
                    {fr ? "Matériau" : "Material"}
                  </span>
                  <select
                    value={focusedMaterial}
                    onChange={(event) => selectMaterial(event.target.value)}
                    className="max-w-[min(100%,20rem)] truncate rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm"
                  >
                    {materialsOrdered.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {focusIndex + 1}/{materialsOrdered.length}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => stepMaterial(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={fr ? "Matériau suivant" : "Next material"}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {layout === "compare" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-1">
                  {comparePair === "simey" &&
                  (pack?.id ?? packId) === "pokemon" ? (
                    <SimeyIsoCompareRow
                      fr={fr}
                      leaf={focusedMaterial!}
                      tilt={tilt}
                      locale={locale}
                      packId={pack?.id ?? packId}
                      samples={samples}
                      art={focusedArts[0] ?? null}
                    />
                  ) : (
                    (focusedArts.length > 0 ? focusedArts : [null]).map(
                      (art, artIndex) => (
                        <div
                          key={
                            art?.bundleId ??
                            art?.imageUrl ??
                            `${focusedMaterial}:face-${artIndex}`
                          }
                          className="grid shrink-0 grid-cols-2 gap-4"
                        >
                          {COMPARE_SIDES_UNITY.map((side) => (
                            <div
                              key={side.backend}
                              className="flex flex-col items-center gap-1.5"
                            >
                              {artIndex === 0 ? (
                                <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                  {fr ? side.labelFr : side.labelEn}
                                </span>
                              ) : (
                                <span className="h-[22px]" aria-hidden />
                              )}
                              <div className="flex w-full items-center justify-center">
                                <MaterialTile
                                  key={`${pack?.id ?? packId}:${focusedMaterial}:${side.backend}:${art?.bundleId ?? artIndex}`}
                                  packId={pack?.id ?? packId}
                                  materialName={focusedMaterial!}
                                  samples={samples}
                                  backend={side.backend}
                                  tilt={tilt}
                                  locale={locale}
                                  size="stack"
                                  packArt={art}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ),
                    )
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto py-1">
                  {(focusedArts.length > 0 ? focusedArts : [null]).map(
                    (art, artIndex) => (
                      <div
                        key={
                          art?.bundleId ??
                          art?.imageUrl ??
                          `${focusedMaterial}:face-${artIndex}`
                        }
                        className="flex min-h-0 w-full flex-1 flex-col items-center gap-2"
                      >
                        <MaterialTile
                          key={`${pack?.id ?? packId}:${focusedMaterial}:${art?.bundleId ?? artIndex}`}
                          packId={pack?.id ?? packId}
                          materialName={focusedMaterial!}
                          samples={samples}
                          backend={backend}
                          tilt={tilt}
                          locale={locale}
                          size="focus"
                          packArt={art}
                        />
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {materialsOrdered.map((name) => (
                <MaterialTile
                  key={name}
                  packId={pack?.id ?? packId}
                  materialName={name}
                  samples={samples}
                  backend={backend}
                  tilt={tilt}
                  locale={locale}
                  // Server-resolved face: the browser cannot read the dump.
                  packArt={artsFor(name)[0] ?? null}
                  onFocus={selectMaterial}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
