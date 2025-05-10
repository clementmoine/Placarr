"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { CarouselApi } from "@/components/ui/carousel";

interface CarouselDotsProps {
  api: CarouselApi | undefined;
  className?: string;
}

export function CarouselDots({ api, className }: CarouselDotsProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!api) return;

    setScrollSnaps(api.scrollSnapList());
    setSelectedIndex(api.selectedScrollSnap());

    api.on("select", () => {
      setSelectedIndex(api.selectedScrollSnap());
    });
  }, [api]);

  return (
    <div className={cn("flex justify-center gap-2 mt-4", className)}>
      {scrollSnaps.map((_, index) => (
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
