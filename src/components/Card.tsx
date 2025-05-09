"use client";

import Image from "next/image";
import React, { useMemo } from "react";
import color from "color";

import type { Item } from "@prisma/client";
import { ShelfWithItemCount } from "@/types/shelves";

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
      className="relative flex flex-col w-full select-none gap-2 p-2 overflow-hidden rounded-xl shadow-lg"
      style={{
        aspectRatio: type === "shelf" ? "1.61792 / 1" : "1 / 1.4",
        backgroundColor: (type === "shelf" && props.color) || "#FFF",
      }}
    >
      <div className="flex flex-1 w-full items-center justify-center overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={128}
            height={128}
            alt="Card Logo"
            className="h-full w-full object-contain select-none py-4"
            draggable={false}
          />
        ) : (
          <span className={`text-lg font-bold ${textColor}`}>No Image</span>
        )}
      </div>

      <span
        className={`text-sm text-center w-full ${textColor} line-clamp-2 px-2 shrink-0`}
      >
        {name.trim().length > 1 ? name : "No name"}
        {type === "shelf" && ` (${props._count.items} items)`}
      </span>
    </div>
  );
}
