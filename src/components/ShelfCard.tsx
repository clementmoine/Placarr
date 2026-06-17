import Image from "next/image";
import React, { useMemo } from "react";
import colorLib from "color";
import { cn } from "@/lib/utils";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import type { ShelfWithItemCount } from "@/types/shelves";
import { useLocale } from "@/lib/providers/LocaleProvider";

export function ShelfCard(props: ShelfWithItemCount) {
  const { color, imageUrl, name, type } = props;
  const { t } = useLocale();

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
      className="group relative flex flex-col w-full select-none gap-2 p-3 overflow-hidden rounded-2xl shadow-md bg-card/45 dark:bg-zinc-950/30 backdrop-blur-md border border-border dark:border-zinc-800/65 cursor-pointer hover:-translate-y-1 transition-all duration-300 ease-out"
      style={{
        aspectRatio: "1.61792 / 1",
        backgroundColor: backgroundColor,
      }}
    >
      <div className="flex flex-1 w-full items-center justify-center overflow-hidden pb-8 pt-2 z-10">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={128}
            height={128}
            alt="Shelf Logo"
            className={cn("w-full object-contain select-none h-4/5")}
            draggable={false}
          />
        ) : (
          <span
            className={cn(
              "text-lg font-extrabold tracking-wide transition-transform duration-500 ease-out",
            )}
            style={{ color: foregroundColor }}
          >
            {name.trim().substring(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 p-2 backdrop-blur-md flex justify-center items-center text-center"
        style={{
          backgroundColor: foregroundColor,
        }}
      >
        {type && (
          <span
            className="flex items-center shrink-0"
            style={{ color: textColor }}
          >
            <ShelfTypeIcon type={type} className="size-4" />
          </span>
        )}
        <span
          className="text-xs font-extrabold px-2 flex-1 line-clamp-2 leading-tight"
          style={{ color: textColor }}
        >
          {name.trim().length > 1 ? name : t("common.noName")}
        </span>
      </div>
    </div>
  );
}
