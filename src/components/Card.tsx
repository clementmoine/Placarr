"use client";

import color from "color";
import Image from "next/image";
import React, { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { Item } from "@prisma/client";
import type { ShelfWithItemCount } from "@/types/shelves";

export type CardProps =
  | (Item & { type: "item" })
  | (ShelfWithItemCount & { type: "shelf" });

export function Card(props: CardProps) {
  const { type, imageUrl, name } = props;

  // Compute the highest contrast color (black or white) based on the background color
  const textColor = useMemo(() => {
    try {
      return color((type === "shelf" && props.color) || "#FFF").isLight()
        ? "text-black"
        : "text-white";
    } catch {
      return "text-black"; // Fallback to black if the color is invalid
    }
  }, [type, props]);

  return (
    <div
      className="relative flex flex-col w-full select-none gap-2 p-2 overflow-hidden rounded-xl shadow-lg bg-white"
      style={{
        aspectRatio: type === "shelf" ? "1.61792 / 1" : "1 / 1.4",
        backgroundColor: (type === "shelf" && props.color) || undefined,
      }}
    >
      <div className="flex flex-1 w-full items-center justify-center overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={128}
            height={128}
            alt="Card Logo"
            className={cn(
              "w-full object-contain select-none",
              type === "shelf" ? "h-2/3" : "h-full",
            )}
            draggable={false}
          />
        ) : (
          <span
            className={cn(
              "text-lg font-bold text-foreground",
              type === "shelf" ? textColor : undefined,
            )}
          >
            No Image
          </span>
        )}
      </div>

      <span
        className={cn(
          `text-sm text-center w-full ${textColor} px-2 shrink-0`,
          type === "shelf" ? "line-clamp-1" : "line-clamp-2",
        )}
      >
        {name.trim().length > 1 ? name : "No name"}
      </span>
    </div>
  );
}
