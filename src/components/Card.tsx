"use client";

import Image from "next/image";
import React, { useMemo } from "react";
import color from "color";

import type { Item, Shelf } from "@prisma/client";

export type CardProps = (Item & { type: "item" }) | (Shelf & { type: "shelf" });

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
      className="flex flex-col gap-2 items-center justify-center overflow-hidden rounded-xl shadow-lg backface-hidden relative w-full select-none"
      style={{
        aspectRatio: "1.61792 / 1",
        backgroundColor: (type === "shelf" && props.color) || "#FFF",
      }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          width={128}
          height={128}
          alt="Card Logo"
          className="size-1/2 object-contain select-none"
          draggable={false}
        />
      ) : (
        <span className={`text-lg font-bold ${textColor}`}>No logo</span>
      )}
      <span
        className={`text-sm text-center w-full ${textColor} line-clamp-2 px-2`}
      >
        {name.trim().length > 1 ? name : "No name"}
      </span>
    </div>
  );
}
