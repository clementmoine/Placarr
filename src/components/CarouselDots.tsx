"use client";

import * as React from "react";
import { cn } from "@/lib/shared/utils";
import type { CarouselApi } from "@/components/ui/carousel";

interface CarouselDotsProps {
  api: CarouselApi | undefined;
  className?: string;
}

export function CarouselDots({ api, className }: CarouselDotsProps) {
  // Embla est un store externe : on s'y abonne via useSyncExternalStore au
  // lieu de recopier son état dans des useState en effect. Les snapshots sont
  // des primitives (index, nombre de snaps) pour rester référentiellement
  // stables. L'abonnement couvre aussi reInit (resize / changement de slides)
  // et se désabonne au démontage — l'ancien effect fuyait son listener.
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!api) return () => {};
      api.on("select", onStoreChange);
      api.on("reInit", onStoreChange);
      return () => {
        api.off("select", onStoreChange);
        api.off("reInit", onStoreChange);
      };
    },
    [api],
  );

  const selectedIndex = React.useSyncExternalStore(
    subscribe,
    () => api?.selectedScrollSnap() ?? 0,
    () => 0,
  );
  const snapCount = React.useSyncExternalStore(
    subscribe,
    () => api?.scrollSnapList().length ?? 0,
    () => 0,
  );

  return (
    <div className={cn("flex justify-center gap-2 mt-4", className)}>
      {Array.from({ length: snapCount }, (_, index) => (
        <button
          key={index}
          className={cn(
            "size-2 rounded-full transition-colors",
            selectedIndex === index ? "bg-primary" : "bg-muted",
          )}
          onClick={() => api?.scrollTo(index)}
        />
      ))}
    </div>
  );
}
