import Image from "next/image";
import React, { useMemo } from "react";
import colorLib from "color";
import { cn } from "@/lib/core/utils";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import type { ShelfWithItemCount } from "@/types/shelves";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

export function ShelfCard(props: ShelfWithItemCount) {
  const { color, imageUrl, name, type, bestItem } = props;
  const { t } = useLocale();
  const backgroundImageUrl =
    bestItem?.backgroundImageUrl || bestItem?.imageUrl || null;

  // Safely parse colors (handles color names like 'white' or 'blue' plus standard hex codes)
  const safeColor = useMemo(() => {
    if (!color) return undefined;
    try {
      return colorLib(color);
    } catch {
      return undefined;
    }
  }, [color]);

  const backgroundColor = useMemo(() => {
    if (!safeColor) return undefined;
    return safeColor.string();
  }, [safeColor]);

  const foregroundColor = useMemo(() => {
    if (!safeColor) return undefined;
    return safeColor.lighten(0.8).string();
  }, [safeColor]);

  // Ensure readable text contrast inside the bottom bar
  const textColor = useMemo(() => {
    if (!safeColor) return "#f4f4f5";
    const lightened = safeColor.lighten(0.8);
    return lightened.isLight() ? "#18181b" : "#f4f4f5";
  }, [safeColor]);

  return (
    <div
      className="group relative justify-between flex flex-col w-full select-none gap-2 p-4 sm:p-6 overflow-hidden rounded-2xl shadow-md bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md border border-border dark:border-zinc-800/65 cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out"
      style={{
        aspectRatio: "1.61792 / 1",
        backgroundColor: backgroundColor,
      }}
    >
      {/* Background = the shelf's best-rated item's artwork, tinted by the shelf
          color gradient (kept even without a background so the look is stable). */}
      {backgroundImageUrl && (
        <Image
          src={backgroundImageUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, 320px"
          className="absolute inset-0 object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          draggable={false}
        />
      )}

      {/* Gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(${safeColor?.rgb().array().join(", ")}, 0.7) 0%, rgba(7, 30, 44, 0.7) 100%)`,
        }}
      />

      {imageUrl ? (
        <Image
          src={imageUrl}
          width={128}
          height={128}
          alt="Shelf Logo"
          className={cn(
            "relative object-contain select-none min-w-15 h-10 w-auto object-top-left z-1",
          )}
          draggable={false}
        />
      ) : (
        <span
          className={cn(
            "relative z-1 text-lg font-extrabold tracking-wide transition-transform duration-500 ease-out",
          )}
          style={{ color: foregroundColor }}
        >
          {name.trim().substring(0, 2).toUpperCase()}
        </span>
      )}

      <span className="relative w-full text-left text-white font-semibold text-lg sm:text-xl truncate z-1">
        {name.trim().length > 1 ? name : t("common.noName")}
      </span>
    </div>
  );
}
