"use client";

import colorjs from "color";
import Image from "next/image";
import React, { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { ShelfWithItemCount } from "@/types/shelves";

export function ShelfCard(props: ShelfWithItemCount) {
  const { color, imageUrl, name } = props;

  // Compute the highest contrast color (black or white) based on the background color
  const textColor = useMemo(() => {
    try {
      return colorjs(color || "#FFF").isLight() ? "text-black" : "text-white";
    } catch {
      return "text-black"; // Fallback to black if the color is invalid
    }
  }, [color]);

  return (
    <div
      className="relative flex flex-col w-full select-none gap-2 p-2 overflow-hidden rounded-xl shadow-lg bg-white"
      style={{
        aspectRatio: "1.61792 / 1",
        backgroundColor: color || undefined,
      }}
    >
      <div className="flex flex-1 w-full items-center justify-center overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={128}
            height={128}
            alt="Shelf Logo"
            className={cn("w-full object-contain select-none h-2/3")}
            draggable={false}
          />
        ) : (
          <span className={cn("text-lg font-bold text-foreground", textColor)}>
            No Image
          </span>
        )}
      </div>

      <span
        className={cn(
          `text-sm text-center w-full ${textColor} px-2 shrink-0 line-clamp-1`,
        )}
      >
        {name.trim().length > 1 ? name : "No name"}
      </span>
    </div>
  );
}
