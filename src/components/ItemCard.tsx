"use client";

import Image from "next/image";
import React from "react";

import { cn } from "@/lib/utils";

import type { Item } from "@prisma/client";

export function ItemCard(props: Item) {
  const { imageUrl, name } = props;

  return (
    <div
      className="relative flex flex-col w-full select-none gap-4 p-4 overflow-hidden rounded-xl shadow-lg bg-card"
      style={{
        aspectRatio: "1 / 1.4",
      }}
    >
      <div className="flex flex-1 w-full items-center justify-center overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            width={128}
            height={128}
            alt="Item Logo"
            className={cn(
              "w-full h-full object-contain select-none bg-background",
            )}
            draggable={false}
          />
        ) : (
          <span className={cn("text-lg font-bold text-foreground")}>
            No Image
          </span>
        )}
      </div>

      <span
        className={cn("text-sm text-center w-full  px-2 shrink-0 line-clamp-2")}
      >
        {name.trim().length > 1 ? name : "No name"}
      </span>
    </div>
  );
}
