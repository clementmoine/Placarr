"use client";

import type { CSSProperties, SyntheticEvent } from "react";

import { RemoteImage } from "@/components/RemoteImage";
import { cn } from "@/lib/shared/utils";

export type DiscFaceArtProps = {
  src: string;
  alt: string;
  /** Prefer RemoteImage on shelf tiles (sizes / priority); plain img in 3D faces. */
  mode?: "remote" | "img";
  priority?: boolean;
  className?: string;
  /** Soft iridescent sheen on the printed face (detail Disc3D). */
  sheen?: boolean;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
};

/**
 * Circular crop of disc / support art — square frame, object-cover, hub hole.
 * Shared by the loose Disc3D hero and shelf ItemCard tiles.
 */
export function DiscFaceArt({
  src,
  alt,
  mode = "remote",
  priority,
  className,
  sheen = false,
  onLoad,
  onError,
}: DiscFaceArtProps) {
  const imageClass =
    "size-full select-none object-cover object-center";

  const hubMask =
    "radial-gradient(circle closest-side, transparent 0 14%, #000 14.5%)";

  return (
    <div
      className={cn(
        "relative aspect-square size-full overflow-hidden rounded-full",
        className,
      )}
      style={
        {
          maskImage: hubMask,
          WebkitMaskImage: hubMask,
        } as CSSProperties
      }
    >
      {mode === "img" ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={onLoad}
          onError={() => onError?.()}
          className={imageClass}
        />
      ) : (
        <RemoteImage
          src={src}
          alt={alt}
          priority={priority}
          onLoad={onLoad}
          onError={() => onError?.()}
          className={imageClass}
        />
      )}
      {sheen && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={
            {
              background: `
                linear-gradient(
                  calc(var(--disc-glare-nx, 50) * 1.8deg + 50deg) in oklch,
                  transparent 20%,
                  oklch(0.85 0.12 200 / 0.22) 45%,
                  oklch(0.88 0.14 320 / 0.2) 55%,
                  transparent 80%
                ),
                radial-gradient(
                  ellipse 48% 32% at var(--disc-glare-x, 50%) var(--disc-glare-y, 42%),
                  oklch(1 0 0 / 0.32) 0%,
                  transparent 55%
                )`,
              mixBlendMode: "soft-light",
              opacity: 0.9,
              maskImage:
                "radial-gradient(circle, transparent 8%, black 16%, black 92%, transparent 99%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 8%, black 16%, black 92%, transparent 99%)",
            } as CSSProperties
          }
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[15%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]"
      />
    </div>
  );
}
