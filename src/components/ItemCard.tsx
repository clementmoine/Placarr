"use client";

import React, { useMemo, useRef, useState, type SyntheticEvent } from "react";
import type { Item } from "@/generated/prisma/browser";
import type { MetadataResult } from "@/types/metadataProvider";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  DEFAULT_SHELF_TYPE_ICON,
  SHELF_TYPE_ICONS,
} from "@/components/ShelfTypeIcon";
import { RemoteImage } from "@/components/RemoteImage";
import { CardBackSkeleton } from "@/components/CardBackSkeleton";
import { FoilCardImage } from "@/components/FoilCardImage";
import {
  usePrintVariant,
  variantRendering,
} from "@/lib/client/hooks/usePrintVariant";
import { useMirroredCropMask } from "@/lib/client/hooks/useMirroredCropMask";
import {
  edgeGradient,
  useImageEdgeColors,
} from "@/lib/client/hooks/useImageEdgeColors";

import {
  resolveDefaultCardBack,
  sharedCardBackSkeletonUrl,
} from "@/core/render/foil";
import "@/effects";
import { getAspectRatio, orientAspectRatio } from "@/lib/text/cardFormat";
import { OrientedMediaRotator } from "@/components/OrientedMediaFrame";
import { localizeFinishLabel } from "@/lib/text/finishLabel";
import { getItemValueEstimate } from "@/core/collect/value";
import { isItemMetadataBusy } from "@/core/collect/enrichment";
import type { Condition } from "@/generated/prisma/browser";
import { withoutCopyMarker } from "@/core/collect/groupCopies";
import { shelfShowsItemCondition } from "@/core/collect/condition";
import { cn } from "@/lib/shared/utils";

function conditionBadgeClass(condition: Condition) {
  switch (condition) {
    case "new":
      return "text-emerald-300 border-emerald-400/25";
    case "used":
      return "text-amber-400 border-white/10";
    case "loose":
      return "text-sky-300 border-sky-400/25";
    case "damaged":
      return "text-red-300 border-red-400/25";
    default:
      return "text-zinc-200 border-white/10";
  }
}

interface ItemCardProps extends Item {
  /**
   * How many copies of this object the collector owns. The tile stands for all
   * of them: `Item` stays one physical copy, and the fold is display-only.
   */
  copyCount?: number;
  shelfType?: string | null;
  shelfName?: string | null;
  cardFormat?: string | null;
  metadata?: MetadataResult | null;
  priceNew?: number | null;
  priceFoil?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  priceEstimated?: number | null;
  priceEstimatedFoil?: number | null;
  priority?: boolean;
}

function itemCardPropsEqual(prev: ItemCardProps, next: ItemCardProps): boolean {
  return (
    prev.id === next.id &&
    prev.imageUrl === next.imageUrl &&
    prev.name === next.name &&
    prev.condition === next.condition &&
    prev.shelfType === next.shelfType &&
    prev.shelfName === next.shelfName &&
    prev.cardFormat === next.cardFormat &&
    prev.priceNew === next.priceNew &&
    prev.priceFoil === next.priceFoil &&
    prev.priceUsed === next.priceUsed &&
    prev.priceUsedCIB === next.priceUsedCIB &&
    prev.priceEstimated === next.priceEstimated &&
    prev.priceEstimatedFoil === next.priceEstimatedFoil &&
    prev.priority === next.priority &&
    prev.metadataId === next.metadataId &&
    prev.metadataRefreshStartedAt === next.metadataRefreshStartedAt &&
    prev.variant === next.variant &&
    prev.printKey === next.printKey &&
    prev.copyCount === next.copyCount &&
    prev.metadata?.imageUrl === next.metadata?.imageUrl &&
    (prev.metadata?.attachments?.length ?? 0) ===
      (next.metadata?.attachments?.length ?? 0) &&
    prev.createdAt === next.createdAt
  );
}

function ItemCardInner(props: ItemCardProps) {
  const {
    imageUrl,
    name,
    shelfType,
    cardFormat,
    condition,
    priority,
    copyCount = 1,
  } = props;
  const { t } = useLocale();
  /**
   * The copy marker in the title becomes noise once the tile says how many
   * there are — and on the lead copy it was always arbitrary which of the four
   * wore it.
   */
  const displayName = copyCount > 1 ? withoutCopyMarker(name) : name;
  const titledName = displayName.replace(
    / — ([A-Za-z][\w]*)$/u,
    (_match, finish: string) => ` — ${localizeFinishLabel(finish, t)}`,
  );
  /**
   * A foil copy has to be recognisable in the grid, not only once opened —
   * otherwise the one thing that separates it from an ordinary copy is
   * invisible exactly where a collector scans their collection.
   */
  /**
   * Asked for by the tile itself. The answer is shared and batched, so a grid
   * of cards costs one request — and no list has to remember to resolve this on
   * its cards' behalf, which is how the shelf grid ended up being the only
   * place a foil print looked foil.
   */
  const printVariant = usePrintVariant(props.printKey, shelfType);
  const variantView = variantRendering(props.variant, printVariant, imageUrl);
  const cardBackSkeletonUrl = sharedCardBackSkeletonUrl(
    resolveDefaultCardBack({
      printCardBackUrl: printVariant?.cardBackUrl,
      printKey: props.printKey,
      setCode: printVariant?.setCode,
      effectPackId:
        variantView.effectPackId ?? printVariant?.effectPack ?? null,
    }),
  );
  const foilMaskUrl = useMirroredCropMask(
    variantView.imageUrl,
    variantView.foilMaskUrl,
  );
  // The stamped coat is a layer of its own, and on the tiers that carry one it
  // is most of what makes the card look special. Leaving it to the detail page
  // meant a hot-foiled print was drawn on the shelf as a plain foil.
  const varnishMaskUrl = useMirroredCropMask(
    variantView.imageUrl,
    variantView.varnishMaskUrl,
  );
  const secondVarnishMaskUrl = useMirroredCropMask(
    variantView.imageUrl,
    variantView.secondVarnishMaskUrl,
  );
  const [imageFit, setImageFit] = useState<"cover" | "contain">("contain");
  const [plainArtReady, setPlainArtReady] = useState(false);
  const artFrameRef = useRef<HTMLDivElement | null>(null);
  const isEnriching = isItemMetadataBusy(props);
  /**
   * Covers are contained, so a portrait box art in a landscape tile — or the
   * reverse — leaves empty bands. Painted with the artwork's own edge colours
   * they read as the image continuing past the frame, instead of as a white
   * slab the cover floats on.
   */
  const {
    colors: edgeColors,
    measure: measureEdges,
    reset: resetEdgeColors,
  } = useImageEdgeColors();

  const displayImageUrl = imageUrl;

  // Determine aspect ratio based on shelf type or card format (+ print orientation).
  const faceQuarterTurns = printVariant?.faceQuarterTurns ?? 0;
  const baseAspect = useMemo(
    () => getAspectRatio(cardFormat, shelfType),
    [cardFormat, shelfType],
  );
  const aspectRatio = useMemo(
    () => orientAspectRatio(baseAspect, faceQuarterTurns),
    [baseAspect, faceQuarterTurns],
  );

  // Pick placeholder icon based on shelf type — memoized as an ELEMENT so no
  // component identity is created during render.
  const placeholderIcon = useMemo(() => {
    const IconComponent =
      SHELF_TYPE_ICONS[shelfType ?? ""] ?? DEFAULT_SHELF_TYPE_ICON;
    return (
      <IconComponent className="size-8 text-zinc-400 dark:text-zinc-500 transition-transform duration-500" />
    );
  }, [shelfType]);

  // Réinitialisation quand l'URL change — ajustée pendant le render (pattern
  // React « adjust state when props change »), pas dans un effect.
  const [prevImageUrl, setPrevImageUrl] = useState(displayImageUrl);
  if (prevImageUrl !== displayImageUrl) {
    setPrevImageUrl(displayImageUrl);
    setImageFit("contain");
    setPlainArtReady(false);
    resetEdgeColors();
  }

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    setPlainArtReady(true);
    setImageFit("contain");
    const frame = artFrameRef.current;
    measureEdges(
      event.currentTarget,
      frame
        ? { width: frame.clientWidth, height: frame.clientHeight }
        : undefined,
    );
  };

  const estimatedPrice = useMemo(() => {
    const value = getItemValueEstimate({
      condition: props.condition,
      shelfType: props.shelfType,
      variant: props.variant,
      plainFinishes: printVariant?.plainFinishes,
      priceNew: props.priceNew,
      priceFoil: props.priceFoil,
      priceUsed: props.priceUsed,
      priceUsedCIB: props.priceUsedCIB,
      priceEstimated: props.priceEstimated,
      priceEstimatedFoil: props.priceEstimatedFoil,
    });
    if (!value || value.cents === 0) return null;
    return { euros: value.cents / 100, isEstimate: value.isEstimate };
  }, [
    props.condition,
    props.shelfType,
    props.variant,
    printVariant?.plainFinishes,
    props.priceNew,
    props.priceFoil,
    props.priceUsed,
    props.priceUsedCIB,
    props.priceEstimated,
    props.priceEstimatedFoil,
  ]);

  return (
    <div
      className="cv-card-item group relative flex flex-col w-full select-none overflow-hidden rounded-2xl shadow-md bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md border border-border dark:border-zinc-800/65 cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out"
      style={{
        aspectRatio,
      }}
    >
      {/* Top-right badges — price + condition stay visible even while enriching */}
      {(estimatedPrice !== null ||
        (condition && shelfShowsItemCondition(shelfType)) ||
        copyCount > 1 ||
        (variantView.foilMaskUrl && props.variant)) && (
        <div className="absolute top-2 right-2 z-20 pointer-events-none select-none flex flex-col items-end gap-1">
          {estimatedPrice !== null && (
            <span className="text-[9px] font-black tabular-nums px-2 py-0.5 rounded-full bg-zinc-950/90 text-emerald-300 border border-emerald-400/30 shadow-sm">
              {estimatedPrice.isEstimate ? "~" : ""}
              {estimatedPrice.euros.toFixed(2)} €
            </span>
          )}
          {copyCount > 1 && (
            <span className="text-[9px] font-black tabular-nums px-2 py-0.5 rounded-full border border-white/15 bg-zinc-950/90 text-zinc-100 shadow-sm">
              ×{copyCount}
            </span>
          )}
          {variantView.foilMaskUrl && props.variant && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-amber-300/40 bg-zinc-950/90 text-amber-200 shadow-sm">
              ✦ {localizeFinishLabel(props.variant, t)}
            </span>
          )}
          {condition && shelfShowsItemCondition(shelfType) && (
            <span
              className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-zinc-950/90 shadow-sm",
                conditionBadgeClass(condition),
              )}
            >
              {t(`items.conditions.${condition}`) || condition}
            </span>
          )}
        </div>
      )}

      {/* Enriching overlay — centered spinner; badges & title remain on top */}
      {isEnriching && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45 backdrop-blur-[1px] pointer-events-none">
          <Loader2 className="size-7 animate-spin text-white/90" />
          <span className="text-[9px] font-black uppercase tracking-wider text-white/80">
            {t("items.fetching")}
          </span>
        </div>
      )}

      {displayImageUrl ? (
        <div
          ref={artFrameRef}
          className="relative h-full w-full overflow-hidden rounded-[inherit] bg-zinc-200 dark:bg-zinc-950"
          style={
            edgeColors && !foilMaskUrl
              ? { background: edgeGradient(edgeColors) }
              : undefined
          }
        >
          {/* Bleeding the cover's own edges wins; the back only fills a frame
              that has nothing else behind it. */}
          {!(edgeColors && !foilMaskUrl) && (
            <CardBackSkeleton
              url={cardBackSkeletonUrl}
              faceQuarterTurns={faceQuarterTurns}
              orientedAspect={aspectRatio}
            />
          )}
          <OrientedMediaRotator
            faceQuarterTurns={faceQuarterTurns}
            orientedAspect={aspectRatio}
          >
            {/* Main Cover Image */}
            {foilMaskUrl ? (
              <FoilCardImage
                effectPack={variantView.effectPackId}
                printKey={props.printKey}
                title={name}
                imageUrl={variantView.imageUrl ?? displayImageUrl}
                alt={name}
                finish={variantView.finish}
                varnishType={variantView.varnishType}
                cssFinishShaderId={variantView.shader?.id ?? null}
                cssVarnishShaderId={variantView.varnish?.id ?? null}
                maskUrl={foilMaskUrl}
                varnishMaskUrl={varnishMaskUrl}
                varnishColor={variantView.varnishColor}
                secondVarnishMaskUrl={secondVarnishMaskUrl}
                secondVarnishColor={variantView.secondVarnishColor}
                // Cover: TCG scans are ~tile ratio, and `contain` leaves a 1px
                // letterbox whose edge bleed samples the print's white border.
                fit="cover"
                // Grids stay on CSS foil: WebGL is for the detail hero / fullscreen
                // only (one context, readable art).
                backend="css"
                // A wall of tiles each tipping under the cursor reads as the page
                // squirming. The light still drifts, which is what marks the copy.
                tilt={false}
              />
            ) : (
              <RemoteImage
                src={displayImageUrl}
                alt={name}
                priority={priority}
                onLoad={handleImageLoad}
                className={[
                  "w-full h-full select-none transition-opacity duration-150 ease-out object-center",
                  imageFit === "contain" ? "object-contain" : "object-cover",
                  cardBackSkeletonUrl && !plainArtReady ? "opacity-0" : "",
                ].join(" ")}
              />
            )}
          </OrientedMediaRotator>
          {/* subtle dark overlay gradient for title legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        </div>
      ) : (
        /* Premium looking placeholder fallback */
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950 text-muted-foreground gap-3">
          {placeholderIcon}
          <span className="text-[10px] font-extrabold tracking-wide uppercase text-zinc-400 dark:text-zinc-550">
            {name.trim().substring(0, 2).toUpperCase() || "??"}
          </span>
        </div>
      )}

      {/* Glassmorphic bottom panel — title (stays above the enriching overlay) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-2.5 py-2 bg-zinc-950/75 backdrop-blur-md border-t border-white/10">
        <span className="text-[10px] font-extrabold line-clamp-2 text-white leading-tight">
          {titledName.trim().length > 0 ? titledName : t("common.noName")}
        </span>
      </div>
    </div>
  );
}

export const ItemCard = React.memo(ItemCardInner, itemCardPropsEqual);
