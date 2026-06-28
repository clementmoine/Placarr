import type { SyntheticEvent } from "react";
import Image from "next/image";

import { cn } from "@/lib/core/utils";

function isBlobImageSrc(src: string) {
  return src.startsWith("blob:");
}

function wantsFillLayout(className?: string) {
  return /\bw-full\b/.test(className ?? "") && /\bh-full\b/.test(className ?? "");
}

function aspectRatioClassName(className?: string) {
  const value = className ?? "";
  const patches: string[] = [];
  if (
    /\bw-full\b/.test(value) &&
    !/\bh-full\b/.test(value) &&
    !/\bh-auto\b/.test(value)
  ) {
    patches.push("h-auto");
  }
  if (
    /\bh-full\b/.test(value) &&
    !/\bw-full\b/.test(value) &&
    !/\bw-auto\b/.test(value)
  ) {
    patches.push("w-auto");
  }
  return patches.join(" ");
}

export function RemoteImage({
  src,
  alt,
  className,
  width = 512,
  height = 512,
  sizes = "(max-width: 640px) 50vw, 384px",
  fill,
  priority,
  onLoad,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  sizes?: string;
  fill?: boolean;
  priority?: boolean;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  if (isBlobImageSrc(src)) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        onLoad={onLoad}
        draggable={false}
      />
    );
  }

  const useFill = fill ?? wantsFillLayout(className);

  if (useFill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={className}
        onLoad={onLoad}
        draggable={false}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={cn(aspectRatioClassName(className), className)}
      onLoad={onLoad}
      draggable={false}
    />
  );
}
