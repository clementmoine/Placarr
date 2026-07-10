"use client";

import React, { useMemo, useState, type SyntheticEvent } from "react";
import type { Item } from "@prisma/client";
import type { MetadataResult } from "@/types/metadataProvider";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  DEFAULT_SHELF_TYPE_ICON,
  SHELF_TYPE_ICONS,
} from "@/components/ShelfTypeIcon";
import { RemoteImage } from "@/components/RemoteImage";

import { getAspectRatio } from "@/lib/text/cardFormat";
import { getEstimatedItemValueCents } from "@/core/collect/value";
import { isItemMetadataBusy } from "@/core/collect/enrichment";
import type { Condition } from "@prisma/client";
import { cn } from "@/lib/shared/utils";

function conditionBadgeClass(condition: Condition) {
  switch (condition) {
    case "new":
      return "text-emerald-300 border-emerald-400/25";
    case "used":
      return "text-amber-400 border-white/10";
    case "damaged":
      return "text-red-300 border-red-400/25";
    default:
      return "text-zinc-200 border-white/10";
  }
}

interface ItemCardProps extends Item {
  shelfType?: string | null;
  cardFormat?: string | null;
  metadata?: MetadataResult | null;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
  priority?: boolean;
}

function itemCardPropsEqual(prev: ItemCardProps, next: ItemCardProps): boolean {
  return (
    prev.id === next.id &&
    prev.imageUrl === next.imageUrl &&
    prev.name === next.name &&
    prev.condition === next.condition &&
    prev.shelfType === next.shelfType &&
    prev.cardFormat === next.cardFormat &&
    prev.priceNew === next.priceNew &&
    prev.priceUsed === next.priceUsed &&
    prev.priceUsedCIB === next.priceUsedCIB &&
    prev.priority === next.priority &&
    prev.metadataId === next.metadataId &&
    prev.metadataRefreshStartedAt === next.metadataRefreshStartedAt &&
    prev.createdAt === next.createdAt
  );
}

function ItemCardInner(props: ItemCardProps) {
  const { imageUrl, name, shelfType, cardFormat, condition, priority } = props;
  const { t } = useLocale();
  const [imageFit, setImageFit] = useState<"cover" | "contain">("contain");
  const isEnriching = isItemMetadataBusy(props);

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
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (prevImageUrl !== imageUrl) {
    setPrevImageUrl(imageUrl);
    setImageFit("contain");
  }

  const handleImageLoad = (_event: SyntheticEvent<HTMLImageElement>) => {
    setImageFit("contain");
  };

  // Calculate estimated price in Euros
  const estimatedPrice = useMemo(() => {
    const priceCents = getEstimatedItemValueCents({
      condition: props.condition,
      shelfType: props.shelfType,
      priceNew: props.priceNew,
      priceUsed: props.priceUsed,
      priceUsedCIB: props.priceUsedCIB,
    });
    if (priceCents === null || priceCents === 0) return null;
    return priceCents / 100;
  }, [
    props.condition,
    props.shelfType,
    props.priceNew,
    props.priceUsed,
    props.priceUsedCIB,
  ]);

  return (
    <div
      className="cv-card-item group relative flex flex-col w-full select-none overflow-hidden rounded-2xl shadow-md bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md border border-border dark:border-zinc-800/65 cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out"
      style={{
        aspectRatio,
      }}
    >
      {/* Top-right badges — price + condition, opaque for legibility */}
      {(estimatedPrice !== null || condition || isEnriching) && (
        <div className="absolute top-2 right-2 z-10 pointer-events-none select-none flex flex-col items-end gap-1">
          {estimatedPrice !== null && (
            <span className="text-[9px] font-black tabular-nums px-2 py-0.5 rounded-full bg-zinc-950/90 text-emerald-300 border border-emerald-400/30 shadow-sm">
              {estimatedPrice.toFixed(2)} €
            </span>
          )}
          {isEnriching ? (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-zinc-950/90 text-sky-300 border border-sky-400/30 shadow-sm">
              <Loader2 className="size-2.5 animate-spin" />
              {t("items.fetching")}
            </span>
          ) : (
            condition && (
              <span
                className={cn(
                  "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-zinc-950/90 shadow-sm",
                  conditionBadgeClass(condition),
                )}
              >
                {t(`items.conditions.${condition}`) || condition}
              </span>
            )
          )}
        </div>
      )}

      {imageUrl ? (
        <div className="w-full h-full bg-white relative overflow-hidden">
          {/* Main Cover Image */}
          <RemoteImage
            src={imageUrl}
            alt={name}
            priority={priority}
            onLoad={handleImageLoad}
            className={[
              "w-full h-full select-none transition-transform duration-500 ease-out object-top",
              imageFit === "contain" ? "object-contain" : "object-cover",
            ].join(" ")}
          />
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

      {/* Glassmorphic bottom panel — title */}
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-zinc-950/75 backdrop-blur-md border-t border-white/10">
        <span className="text-[10px] font-extrabold line-clamp-2 text-white leading-tight">
          {name.trim().length > 0 ? name : t("common.noName")}
        </span>
      </div>
    </div>
  );
}

export const ItemCard = React.memo(ItemCardInner, itemCardPropsEqual);
