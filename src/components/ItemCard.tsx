"use client";

import React, { useMemo, useState, type SyntheticEvent } from "react";
import type { Item } from "@/generated/prisma/browser";
import type { MetadataResult } from "@/types/metadataProvider";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  DEFAULT_SHELF_TYPE_ICON,
  SHELF_TYPE_ICONS,
} from "@/components/ShelfTypeIcon";
import { RemoteImage } from "@/components/RemoteImage";
import { HoloCardImage } from "@/components/HoloCardImage";
import {
  variantRendering,
  type PrintVariantInfo,
} from "@/lib/client/hooks/usePrintVariant";
import { useMirroredCropMask } from "@/lib/client/hooks/useMirroredCropMask";
import {
  edgeGradient,
  useImageEdgeColors,
} from "@/lib/client/hooks/useImageEdgeColors";

import { getAspectRatio } from "@/lib/text/cardFormat";
import { getItemValueEstimate } from "@/core/collect/value";
import { isItemMetadataBusy } from "@/core/collect/enrichment";
import type { Condition } from "@/generated/prisma/browser";
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
   * What this copy is a print of, when the shelf could resolve it. Resolved for
   * the whole shelf at once rather than per tile — see `usePrintVariants`.
   */
  printVariant?: PrintVariantInfo | null;
  shelfType?: string | null;
  shelfName?: string | null;
  cardFormat?: string | null;
  metadata?: MetadataResult | null;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  priceEstimated?: number | null;
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
    prev.priceUsed === next.priceUsed &&
    prev.priceUsedCIB === next.priceUsedCIB &&
    prev.priceEstimated === next.priceEstimated &&
    prev.priority === next.priority &&
    prev.metadataId === next.metadataId &&
    prev.metadataRefreshStartedAt === next.metadataRefreshStartedAt &&
    prev.variant === next.variant &&
    prev.printVariant === next.printVariant &&
    prev.metadata?.imageUrl === next.metadata?.imageUrl &&
    (prev.metadata?.attachments?.length ?? 0) ===
      (next.metadata?.attachments?.length ?? 0) &&
    prev.createdAt === next.createdAt
  );
}

function ItemCardInner(props: ItemCardProps) {
  const { imageUrl, name, shelfType, cardFormat, condition, priority } = props;
  /**
   * A foil copy has to be recognisable in the grid, not only once opened —
   * otherwise the one thing that separates it from an ordinary copy is
   * invisible exactly where a collector scans their collection.
   */
  const variantView = variantRendering(
    props.variant,
    props.printVariant ?? null,
    imageUrl,
  );
  const foilMaskUrl = useMirroredCropMask(
    variantView.imageUrl,
    variantView.foilMaskUrl,
  );
  const { t } = useLocale();
  const [imageFit, setImageFit] = useState<"cover" | "contain">("contain");
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

  // Determine aspect ratio based on shelf type or card format
  const aspectRatio = useMemo(() => {
    return getAspectRatio(cardFormat, shelfType);
  }, [cardFormat, shelfType]);

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
    resetEdgeColors();
  }

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    setImageFit("contain");
    measureEdges(event.currentTarget);
  };

  // Calculate estimated price in Euros — a catalog-estimate fallback shows ~.
  const estimatedPrice = useMemo(() => {
    const value = getItemValueEstimate({
      condition: props.condition,
      shelfType: props.shelfType,
      priceNew: props.priceNew,
      priceUsed: props.priceUsed,
      priceUsedCIB: props.priceUsedCIB,
      priceEstimated: props.priceEstimated,
    });
    if (!value || value.cents === 0) return null;
    return { euros: value.cents / 100, isEstimate: value.isEstimate };
  }, [
    props.condition,
    props.shelfType,
    props.priceNew,
    props.priceUsed,
    props.priceUsedCIB,
    props.priceEstimated,
  ]);

  return (
    <div
      className="cv-card-item group relative flex flex-col w-full select-none overflow-hidden rounded-2xl shadow-md bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md border border-border dark:border-zinc-800/65 cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out"
      style={{
        aspectRatio,
      }}
    >
      {/* Top-right badges — price + condition stay visible even while enriching */}
      {(estimatedPrice !== null || condition) && (
        <div className="absolute top-2 right-2 z-20 pointer-events-none select-none flex flex-col items-end gap-1">
          {estimatedPrice !== null && (
            <span className="text-[9px] font-black tabular-nums px-2 py-0.5 rounded-full bg-zinc-950/90 text-emerald-300 border border-emerald-400/30 shadow-sm">
              {estimatedPrice.isEstimate ? "~" : ""}
              {estimatedPrice.euros.toFixed(2)} €
            </span>
          )}
          {variantView.foilMaskUrl && (
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-amber-300/40 bg-zinc-950/90 text-amber-200 shadow-sm">
              ✦ {props.variant}
            </span>
          )}
          {condition && (
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
          className="w-full h-full bg-white relative overflow-hidden"
          style={
            edgeColors ? { background: edgeGradient(edgeColors) } : undefined
          }
        >
          {/* Main Cover Image */}
          {foilMaskUrl ? (
            <HoloCardImage
              imageUrl={variantView.imageUrl ?? displayImageUrl}
              alt={name}
              maskUrl={foilMaskUrl}
              shader={variantView.shader}
              fit={imageFit}
            />
          ) : (
            <RemoteImage
              src={displayImageUrl}
              alt={name}
              priority={priority}
              onLoad={handleImageLoad}
              className={[
                "w-full h-full select-none transition-transform duration-500 ease-out object-center",
                imageFit === "contain" ? "object-contain" : "object-cover",
              ].join(" ")}
            />
          )}
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
          {name.trim().length > 0 ? name : t("common.noName")}
        </span>
      </div>
    </div>
  );
}

export const ItemCard = React.memo(ItemCardInner, itemCardPropsEqual);
