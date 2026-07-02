import Image from "next/image";
import React, { useMemo } from "react";
import colorLib from "color";
import { cn } from "@/lib/core/utils";
import type { ShelfWithItemCount } from "@/types/shelves";
import { useLocale } from "@/lib/client/providers/LocaleProvider";

export function ShelfCard(props: ShelfWithItemCount) {
  const { color, imageUrl, name, bestItem } = props;
  const { t } = useLocale();
  const backgroundImageUrl =
    bestItem?.backgroundImageUrl || bestItem?.imageUrl || null;

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

  return (
    <div
      className={cn(
        "group relative w-full select-none overflow-hidden rounded-2xl shadow-md",
        "bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md",
        "border border-border dark:border-zinc-800/65",
        "cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out",
        "aspect-[3/2] md:aspect-[1.618/1]",
      )}
      style={{ backgroundColor }}
    >
      {backgroundImageUrl && (
        <Image
          src={backgroundImageUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
          className="absolute inset-0 object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
          draggable={false}
        />
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(${safeColor?.rgb().array().join(", ") ?? "7, 30, 44"}, 0.7) 0%, rgba(7, 30, 44, 0.45) 55%, rgba(0, 0, 0, 0.75) 100%)`,
        }}
      />

      {/* Foreground: flex keeps logo + title in separate bands (no overlap). */}
      <div
        className={cn(
          "absolute inset-0 z-1 flex min-h-0 flex-col justify-between",
          "p-3 sm:p-4 md:p-6",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 items-start justify-start overflow-hidden",
            "max-h-[38%] min-[400px]:max-h-[34%] md:max-h-[40%]",
          )}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              width={128}
              height={128}
              alt="Shelf Logo"
              className={cn(
                "max-h-full w-auto max-w-full object-contain object-left drop-shadow-md",
                "max-w-[10rem] min-[400px]:max-w-[5.5rem] md:max-w-[6.5rem]",
              )}
              draggable={false}
            />
          ) : (
            <span
              className={cn(
                "font-extrabold leading-none tracking-wide drop-shadow-md",
                "text-xl min-[400px]:text-base md:text-lg",
              )}
              style={{ color: foregroundColor }}
            >
              {name.trim().substring(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <span
          className={cn(
            "shrink-0 truncate text-left font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]",
            "text-xl leading-tight min-[400px]:text-base sm:text-lg md:text-xl",
          )}
        >
          {name.trim().length > 1 ? name : t("common.noName")}
        </span>
      </div>
    </div>
  );
}
