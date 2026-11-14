"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  detectLenticularPanelCropsFromRgba,
  lenticularGridImgScale,
  lenticularPanelImgLayout,
  type LenticularPanelCrop,
} from "@/core/render/kayouLenticularArt";
import { KAYOU_SCAN_COVER_BLEED } from "@/core/render/kayouScanCrop";
import { cn } from "@/lib/shared/utils";

const GRID_1X1 = { cols: 1, rows: 1 };

export type KayouScanArtProps = {
  imageUrl: string;
  alt: string;
  className?: string;
  scanCrop?: LenticularPanelCrop | null;
  onLoad?: (
    naturalWidth: number,
    naturalHeight: number,
    scanCrop: LenticularPanelCrop,
  ) => void;
};

export function KayouScanArt({
  imageUrl,
  alt,
  className,
  scanCrop = null,
  onLoad,
}: KayouScanArtProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const naturalRef = useRef({ w: 0, h: 0 });
  const cropRef = useRef<LenticularPanelCrop | null>(scanCrop);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    cropRef.current = scanCrop;
    if (loaded) applyLayoutRef.current();
  }, [scanCrop, loaded]);

  const applyLayout = useCallback(() => {
    const img = imgRef.current;
    const natural = naturalRef.current;
    const { w, h } = sizeRef.current;
    if (!img || w <= 0 || h <= 0 || natural.w <= 0 || natural.h <= 0) return;

    const crops = cropRef.current ? [cropRef.current] : null;
    const scale =
      lenticularGridImgScale(natural, GRID_1X1, w, h, crops) *
      KAYOU_SCAN_COVER_BLEED;
    const layout = lenticularPanelImgLayout(
      natural,
      GRID_1X1,
      0,
      w,
      h,
      crops,
      scale,
    );
    if (!layout) return;
    img.style.width = `${layout.width}px`;
    img.style.height = `${layout.height}px`;
    img.style.left = `${layout.left}px`;
    img.style.top = `${layout.top}px`;
  }, []);

  const applyLayoutRef = useRef(applyLayout);
  useEffect(() => {
    applyLayoutRef.current = applyLayout;
  }, [applyLayout]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        sizeRef.current = { w: cr.width, h: cr.height };
      }
      applyLayoutRef.current();
    });
    ro.observe(wrapper);
    const rect = wrapper.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (loaded) applyLayoutRef.current();
  }, [loaded]);

  return (
    <div
      ref={wrapperRef}
      className={cn("relative h-full w-full overflow-hidden", className)}
      role="img"
      aria-label={alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt={alt}
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        onLoad={(event) => {
          const img = event.currentTarget;
          if (!img.naturalWidth || !img.naturalHeight) return;
          naturalRef.current = {
            w: img.naturalWidth,
            h: img.naturalHeight,
          };
          if (!cropRef.current) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                const { data } = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
                cropRef.current = detectLenticularPanelCropsFromRgba(
                  data,
                  canvas.width,
                  canvas.height,
                  GRID_1X1,
                )[0] ?? { left: 0, top: 0, right: 0, bottom: 0 };
              }
            } catch {
              cropRef.current = { left: 0, top: 0, right: 0, bottom: 0 };
            }
          }
          setLoaded(true);
          onLoad?.(
            img.naturalWidth,
            img.naturalHeight,
            cropRef.current ?? { left: 0, top: 0, right: 0, bottom: 0 },
          );
          const wrapper = wrapperRef.current;
          if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              sizeRef.current = { w: rect.width, h: rect.height };
            }
          }
          applyLayoutRef.current();
        }}
      />
    </div>
  );
}
