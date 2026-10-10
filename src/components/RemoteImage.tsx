"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import Image from "next/image";

import { cn } from "@/lib/shared/utils";
import {
  nextTcgdexDisplayUrl,
  tcgdexDisplayCandidates,
} from "@/core/enrich/media/tcgdexAssetUrls";
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
  loading,
  fetchPriority,
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
  /** @deprecated Prefer `loading="eager"` / `fetchPriority="high"` (Next 16). */
  priority?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const chain = useMemo(() => tcgdexDisplayCandidates(src), [src]);
  const [activeSrc, setActiveSrc] = useState(chain[0] ?? src);

  useEffect(() => {
    setActiveSrc(chain[0] ?? src);
  }, [chain, src]);

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const next = nextTcgdexDisplayUrl(activeSrc, chain);
      if (next && next !== activeSrc) {
        setActiveSrc(next);
        return;
      }
      onError?.(event);
    },
    [activeSrc, chain, onError],
  );

  const displaySrc = remoteImageDisplaySrc(activeSrc);
  const unoptimized =
    remoteImageShouldSkipOptimizer(activeSrc) ||
    remoteImageShouldSkipOptimizer(displaySrc);
  // `priority` alone leaves loading unset; Next 16 LCP warning needs eager.
  const resolvedLoading = loading ?? (priority ? "eager" : undefined);
  const resolvedFetchPriority =
    fetchPriority ?? (priority ? "high" : undefined);

  if (isBlobImageSrc(activeSrc)) {
    return (
      // Aperçus locaux blob:/data: — hors optimiseur next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={activeSrc}
        alt={alt}
        className={className}
        style={style}
        loading={resolvedLoading}
        fetchPriority={resolvedFetchPriority}
        onLoad={onLoad}
        onError={handleError}
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
        loading={resolvedLoading}
        fetchPriority={resolvedFetchPriority}
        unoptimized={unoptimized}
        className={className}
        style={style}
        onLoad={onLoad}
        onError={handleError}
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
      loading={resolvedLoading}
      fetchPriority={resolvedFetchPriority}
      unoptimized={unoptimized}
      className={cn(aspectRatioClassName(className), className)}
      style={style}
      onLoad={onLoad}
      onError={handleError}
      draggable={false}
    />
  );
}
