"use client";

import React, { useMemo } from "react";
import type { Item } from "@prisma/client";
import { useLocale } from "@/lib/providers/LocaleProvider";
import {
  ShelfTypeIcon,
  getShelfTypeIconComponent,
} from "@/components/ShelfTypeIcon";
import Image from "next/image";

import { getAspectRatio } from "@/lib/cardFormat";
import { getEstimatedItemValueCents } from "@/lib/itemValue";

interface ItemCardProps extends Item {
  shelfType?: string | null;
  cardFormat?: string | null;
  metadata?: any;
  priceNew?: number | null;
  priceUsed?: number | null;
  priceUsedCIB?: number | null;
}

export function ItemCard(props: ItemCardProps) {
  const { imageUrl, name, shelfType, cardFormat, condition } = props;
  const { t } = useLocale();

  // Determine aspect ratio based on shelf type or card format
  const aspectRatio = useMemo(() => {
    return getAspectRatio(cardFormat, shelfType);
  }, [cardFormat, shelfType]);

  // Pick placeholder icon based on shelf type
  const PlaceholderIcon = useMemo(() => {
    return getShelfTypeIconComponent(shelfType);
  }, [shelfType]);

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
  }, [props.condition, props.priceNew, props.priceUsed, props.priceUsedCIB]);

  return (
    <div
      className="group relative flex flex-col w-full select-none overflow-hidden rounded-2xl shadow-md bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md border border-border dark:border-zinc-800/65 cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out"
      style={{
        aspectRatio,
      }}
    >
      {/* Badges container */}
      <div className="absolute top-2 left-2 z-10 pointer-events-none select-none flex flex-wrap gap-1">
        {condition && condition !== "new" && (
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-zinc-950/75 backdrop-blur-md text-amber-400 border border-white/10 shadow-sm">
            {t(`items.conditions.${condition}`) || condition}
          </span>
        )}
        {estimatedPrice !== null && (
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-950/85 backdrop-blur-md text-emerald-400 border border-emerald-500/20 shadow-sm">
            {estimatedPrice.toFixed(2)} €
          </span>
        )}
      </div>

      {imageUrl ? (
        <>
          {/* Main Cover Image */}
          <Image
            src={imageUrl}
            alt={name}
            width={512}
            height={512}
            className="w-full h-full object-cover select-none transition-transform duration-500 ease-out"
            draggable={false}
          />
          {/* subtle dark overlay gradient for title legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        </>
      ) : (
        /* Premium looking placeholder fallback */
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950 text-muted-foreground gap-3">
          <PlaceholderIcon className="size-8 text-zinc-400 dark:text-zinc-500 transition-transform duration-500" />
          <span className="text-[10px] font-extrabold tracking-wide uppercase text-zinc-400 dark:text-zinc-550">
            {name.trim().substring(0, 2).toUpperCase() || "??"}
          </span>
        </div>
      )}

      {/* Glassmorphic Bottom Title Bar (cohesive with ShelfCard) */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-zinc-950/75 backdrop-blur-md border-t border-white/10 flex justify-center items-center gap-1.5 text-center">
        {shelfType && (
          <span className="flex items-center shrink-0 text-white/80">
            <ShelfTypeIcon type={shelfType} className="size-3.5" />
          </span>
        )}
        <span className="text-[10px] font-extrabold px-1 flex-1 line-clamp-2 text-white leading-tight">
          {name.trim().length > 0 ? name : t("common.noName")}
        </span>
      </div>
    </div>
  );
}
