import type { CSSProperties, SyntheticEvent } from "react";
import Image from "next/image";

import { cn } from "@/lib/shared/utils";
import {
  remoteImageDisplaySrc,
  remoteImageShouldSkipOptimizer,
} from "@/core/enrich/media/remoteImageDisplay";

function isBlobImageSrc(src: string) {
  return src.startsWith("blob:");
}

function wantsFillLayout(className?: string) {
  return (
    /\bw-full\b/.test(className ?? "") && /\bh-full\b/.test(className ?? "")
  );
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
  style,
  width = 512,
  height = 512,
  // Thumbnails / cards: keep requested widths small. Without a tight `sizes`,
  // `fill` can pick `w=3840` and sharp blocks the Next event loop.
  sizes = "(max-width: 640px) 50vw, 384px",
  fill,
  priority,
  onLoad,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
  sizes?: string;
  fill?: boolean;
  priority?: boolean;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const displaySrc = remoteImageDisplaySrc(src);
  const unoptimized =
    remoteImageShouldSkipOptimizer(src) ||
    remoteImageShouldSkipOptimizer(displaySrc);

  if (isBlobImageSrc(src)) {
    return (
      // Aperçus locaux blob:/data: — hors optimiseur next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        style={style}
        onLoad={onLoad}
        onError={onError}
        draggable={false}
      />
    );
  }

  const useFill = fill ?? wantsFillLayout(className);

  if (useFill) {
    return (
      <Image
        src={displaySrc}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={unoptimized}
        className={className}
        style={style}
        onLoad={onLoad}
        onError={onError}
        draggable={false}
      />
    );
  }

  return (
    <Image
      src={displaySrc}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      unoptimized={unoptimized}
      className={cn(aspectRatioClassName(className), className)}
      style={style}
      onLoad={onLoad}
      onError={onError}
      draggable={false}
    />
  );
}
