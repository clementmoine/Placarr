"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

import {
  resolveLenticularStripLayoutFromRgba,
  lenticularIdleNorm,
  lenticularPairImgLayouts,
  lenticularQuadImgLayouts,
  lenticularPointerNorm,
  lenticularScrubNorm,
  lenticularStripAxis,
  resolveLenticularStripPair,
  resolveLenticularStripQuad,
  type LenticularGrid,
  type LenticularPanelCrop,
  type StackedStripRowBounds,
} from "@/core/render/kayouLenticularArt";
import {
  lenticularBackStripPath,
  lenticularBackStripPathHorizontal,
  lenticularFrontStripPath,
  lenticularFrontStripPathHorizontal,
} from "@/core/render/lenticularStripPaths";
import { cn } from "@/lib/shared/utils";

export type LenticularStripArtProps = {
  imageUrl: string;
  grid: LenticularGrid;
  alt: string;
  className?: string;
  strips?: number;
  sweep?: number;
  tilt?: number;
  perspective?: number;
  travel?: number;
  /** 0–1 scrub follow speed when returning to idle (after pointer leave). */
  ease?: number;
  listenPointer?: boolean;
  onLoad?: (
    naturalWidth: number,
    naturalHeight: number,
    panelCrops: LenticularPanelCrop[],
  ) => void;
  /** Fixed attested crop profile — skips auto pixel detection when set. */
  lenticularCropProfile?: string | null;
};

export type LenticularStripArtHandle = {
  setTarget: (normX: number, normY: number) => void;
  setTargetOffset: (offset: number) => void;
};

/** More strips = finer découpe (hairline ribs). */
const DEFAULT_STRIPS = 40;
const DEFAULT_SWEEP = 0;
const DEFAULT_TILT = 10;
const DEFAULT_PERSPECTIVE = 1000;
const DEFAULT_TRAVEL = 0.72;
const DEFAULT_EASE = 0.14;
const IDLE_SETTLE_EPS = 0.0008;

const clamp = (value: number, lo: number, hi: number): number =>
  value < lo ? lo : value > hi ? hi : value;

const cropLayoutKey = (
  crops: ReadonlyArray<LenticularPanelCrop> | null,
  rowBounds: StackedStripRowBounds | null,
): string =>
  `${crops?.map((c) => `${c.left},${c.top},${c.right},${c.bottom},${c.shiftY ?? 0}`).join("|") ?? "fallback"}|${rowBounds?.join(",") ?? "eq"}`;

type NaturalSize = { w: number; h: number };

type ImgLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
};

const applyImgLayout = (img: HTMLImageElement, layout: ImgLayout): void => {
  img.style.width = `${layout.width}px`;
  img.style.height = `${layout.height}px`;
  img.style.left = `${layout.left}px`;
  img.style.top = `${layout.top}px`;
};

const clipPathFor = (path: string): string =>
  path ? `path('${path}')` : "inset(50%)";

/**
 * Kayou lenticular — lenticular-fx layout.
 *
 * 1×N / N×1: two overlay layers with 1D strip clips.
 * N×M: nested vertical × horizontal clips so diagonals mix all four corners.
 */
export const LenticularStripArt = forwardRef<
  LenticularStripArtHandle,
  LenticularStripArtProps
>(function LenticularStripArt(
  {
    imageUrl,
    grid,
    alt,
    className,
    strips = DEFAULT_STRIPS,
    sweep = DEFAULT_SWEEP,
    tilt = DEFAULT_TILT,
    perspective = DEFAULT_PERSPECTIVE,
    travel = DEFAULT_TRAVEL,
    ease = DEFAULT_EASE,
    listenPointer = true,
    onLoad,
    lenticularCropProfile = null,
  },
  forwardedRef,
) {
  const sliceCount = Math.round(clamp(strips, 8, 64));
  const isGrid2d = grid.cols > 1 && grid.rows > 1;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const backLayerRef = useRef<HTMLDivElement | null>(null);
  const frontLayerRef = useRef<HTMLDivElement | null>(null);
  const frontRef = useRef<HTMLImageElement | null>(null);
  const backRef = useRef<HTMLImageElement | null>(null);
  const colFrontRef = useRef<HTMLDivElement | null>(null);
  const colBackRef = useRef<HTMLDivElement | null>(null);
  const tlLayerRef = useRef<HTMLDivElement | null>(null);
  const trLayerRef = useRef<HTMLDivElement | null>(null);
  const blLayerRef = useRef<HTMLDivElement | null>(null);
  const brLayerRef = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<HTMLImageElement | null>(null);
  const trRef = useRef<HTMLImageElement | null>(null);
  const blRef = useRef<HTMLImageElement | null>(null);
  const brRef = useRef<HTMLImageElement | null>(null);
  const naturalRef = useRef<NaturalSize>({ w: 0, h: 0 });
  const panelCropsRef = useRef<LenticularPanelCrop[] | null>(null);
  const rowBoundsRef = useRef<StackedStripRowBounds | null>(null);
  const normRef = useRef(lenticularIdleNorm(grid));
  const targetRef = useRef(lenticularIdleNorm(grid));
  const sizeRef = useRef({ w: 0, h: 0 });
  const layoutKeyRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const draggingRef = useRef(false);
  const listenPointerRef = useRef(listenPointer);
  const easeRef = useRef(ease);
  const visibleRef = useRef(true);
  const reduceMotionRef = useRef(false);
  const applyFrameRef = useRef<() => void>(() => {});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    easeRef.current = ease;
  }, [ease]);

  useEffect(() => {
    listenPointerRef.current = listenPointer;
  }, [listenPointer]);

  const applyFrame = useCallback(() => {
    const { w, h } = sizeRef.current;
    const natural = naturalRef.current;
    if (w <= 0 || h <= 0 || natural.w <= 0 || natural.h <= 0) return;

    const scene = sceneRef.current;
    const crops = panelCropsRef.current;
    const rows = rowBoundsRef.current;

    if (isGrid2d) {
      const quad = resolveLenticularStripQuad(
        grid,
        normRef.current.x,
        normRef.current.y,
      );
      const xFront = lenticularFrontStripPath(
        quad.blendX,
        sliceCount,
        w,
        h,
        sweep,
      );
      const xBack = lenticularBackStripPath(
        quad.blendX,
        sliceCount,
        w,
        h,
        sweep,
      );
      const yFront = lenticularFrontStripPathHorizontal(
        quad.blendY,
        sliceCount,
        w,
        h,
        sweep,
      );
      const yBack = lenticularBackStripPathHorizontal(
        quad.blendY,
        sliceCount,
        w,
        h,
        sweep,
      );

      const layoutKey = `${w}x${h}:2d:${quad.tl},${quad.tr},${quad.bl},${quad.br}:${cropLayoutKey(crops, rows)}`;
      if (layoutKey !== layoutKeyRef.current) {
        const layouts = lenticularQuadImgLayouts(
          natural,
          grid,
          quad,
          w,
          h,
          crops,
          rows,
        );
        if (layouts) {
          if (tlRef.current) applyImgLayout(tlRef.current, layouts.tl);
          if (trRef.current) applyImgLayout(trRef.current, layouts.tr);
          if (blRef.current) applyImgLayout(blRef.current, layouts.bl);
          if (brRef.current) applyImgLayout(brRef.current, layouts.br);
        }
        layoutKeyRef.current = layoutKey;
      }

      if (colFrontRef.current) {
        colFrontRef.current.style.clipPath = clipPathFor(xFront);
      }
      if (colBackRef.current) {
        colBackRef.current.style.clipPath = clipPathFor(xBack);
      }
      if (tlLayerRef.current) {
        tlLayerRef.current.style.clipPath = clipPathFor(yFront);
      }
      if (trLayerRef.current) {
        trLayerRef.current.style.clipPath = clipPathFor(yFront);
      }
      if (blLayerRef.current) {
        blLayerRef.current.style.clipPath = clipPathFor(yBack);
      }
      if (brLayerRef.current) {
        brLayerRef.current.style.clipPath = clipPathFor(yBack);
      }

      if (scene && tilt > 0) {
        const rx = (0.5 - normRef.current.y) * 2 * tilt;
        const ry = (0.5 - normRef.current.x) * 2 * tilt;
        scene.style.transform = `perspective(${perspective}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      }
      return;
    }

    const pair = resolveLenticularStripPair(
      grid,
      normRef.current.x,
      normRef.current.y,
    );
    const o = pair.blend;
    const axis = lenticularStripAxis(grid, pair.scrubAxis);
    const frontPath =
      axis === "horizontal"
        ? lenticularFrontStripPathHorizontal(o, sliceCount, w, h, sweep)
        : lenticularFrontStripPath(o, sliceCount, w, h, sweep);
    const backPath =
      axis === "horizontal"
        ? lenticularBackStripPathHorizontal(o, sliceCount, w, h, sweep)
        : lenticularBackStripPath(o, sliceCount, w, h, sweep);

    const layoutKey = `${w}x${h}:${pair.panelA}:${pair.panelB}:${cropLayoutKey(crops, rows)}`;
    const frontLayer = frontLayerRef.current;
    const backLayer = backLayerRef.current;
    const front = frontRef.current;
    const back = backRef.current;

    if (layoutKey !== layoutKeyRef.current) {
      const layouts = lenticularPairImgLayouts(
        natural,
        grid,
        pair.panelA,
        pair.panelB,
        w,
        h,
        crops,
        rows,
      );
      if (layouts && front && back) {
        applyImgLayout(front, layouts.a);
        applyImgLayout(back, layouts.b);
      }
      layoutKeyRef.current = layoutKey;
    }

    if (frontLayer) {
      frontLayer.style.clipPath = clipPathFor(frontPath);
    }
    if (backLayer) {
      backLayer.style.clipPath = clipPathFor(backPath);
    }

    if (scene && tilt > 0) {
      const scrub = lenticularScrubNorm(
        grid,
        normRef.current.x,
        normRef.current.y,
        pair.scrubAxis,
      );
      const deg = (0.5 - scrub) * 2 * tilt;
      scene.style.transform =
        axis === "horizontal"
          ? `perspective(${perspective}px) rotateX(${deg.toFixed(2)}deg)`
          : `perspective(${perspective}px) rotateY(${deg.toFixed(2)}deg)`;
    }
  }, [grid, isGrid2d, perspective, sliceCount, sweep, tilt]);

  useEffect(() => {
    applyFrameRef.current = applyFrame;
  }, [applyFrame]);

  const snapToTarget = useCallback(() => {
    normRef.current = targetRef.current;
    applyFrameRef.current();
  }, []);

  const tick = useCallback((ts: number) => {
    if (!visibleRef.current) {
      rafRef.current = null;
      lastTsRef.current = 0;
      return;
    }

    const dt = lastTsRef.current
      ? Math.min(48, ts - lastTsRef.current)
      : 16;
    lastTsRef.current = ts;
    const follow =
      reduceMotionRef.current || draggingRef.current
        ? 1
        : 1 - Math.exp(-dt / Math.max(16, 100 * easeRef.current));

    const current = normRef.current;
    const target = targetRef.current;
    const next = {
      x: current.x + (target.x - current.x) * follow,
      y: current.y + (target.y - current.y) * follow,
    };
    const delta =
      Math.abs(target.x - next.x) + Math.abs(target.y - next.y);

    if (delta < IDLE_SETTLE_EPS) {
      normRef.current = target;
      rafRef.current = null;
      lastTsRef.current = 0;
    } else {
      normRef.current = next;
      rafRef.current = requestAnimationFrame(tick);
    }
    applyFrameRef.current();
  }, []);

  const requestTick = useCallback(() => {
    if (!visibleRef.current || draggingRef.current) return;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      setTarget: (normX: number, normY: number) => {
        targetRef.current = {
          x: clamp(normX, 0, 1),
          y: clamp(normY, 0, 1),
        };
        if (!listenPointerRef.current) {
          snapToTarget();
          return;
        }
        draggingRef.current = true;
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          lastTsRef.current = 0;
        }
        snapToTarget();
      },
      setTargetOffset: (offset: number) => {
        const o = clamp(offset, 0, 1);
        targetRef.current =
          grid.cols === 1 && grid.rows > 1
            ? { x: targetRef.current.x, y: o }
            : { x: o, y: targetRef.current.y };
        if (!listenPointerRef.current) {
          snapToTarget();
          return;
        }
        requestTick();
      },
    }),
    [grid, requestTick, snapToTarget],
  );

  const setTargetFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      draggingRef.current = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        lastTsRef.current = 0;
      }
      const nx = clamp((clientX - rect.left) / rect.width, 0, 1);
      const ny = clamp((clientY - rect.top) / rect.height, 0, 1);
      targetRef.current = lenticularPointerNorm(grid, nx, ny, travel);
      snapToTarget();
    },
    [grid, snapToTarget, travel],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mql.matches;
    const onMql = (event: MediaQueryListEvent) => {
      reduceMotionRef.current = event.matches;
    };
    mql.addEventListener("change", onMql);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) requestTick();
        }
      },
      { threshold: 0 },
    );
    io.observe(wrapper);

    let resizeRaf: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        for (const entry of entries) {
          const cr = entry.contentRect;
          sizeRef.current = { w: cr.width, h: cr.height };
        }
        layoutKeyRef.current = "";
        applyFrameRef.current();
      });
    });
    ro.observe(wrapper);

    const rect = wrapper.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };

    return () => {
      mql.removeEventListener("change", onMql);
      io.disconnect();
      ro.disconnect();
      if (resizeRaf != null) cancelAnimationFrame(resizeRaf);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [applyFrame, requestTick]);

  useEffect(() => {
    if (loaded) applyFrame();
  }, [loaded, applyFrame]);

  useEffect(() => {
    if (!listenPointer) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onMove = (event: PointerEvent) =>
      setTargetFromPointer(event.clientX, event.clientY);
    const onLeave = () => {
      draggingRef.current = false;
      targetRef.current = lenticularIdleNorm(grid);
      requestTick();
    };

    const onEnter = () => {
      draggingRef.current = true;
    };

    wrapper.addEventListener("pointerenter", onEnter, { passive: true });
    wrapper.addEventListener("pointermove", onMove, { passive: true });
    wrapper.addEventListener("pointerleave", onLeave, { passive: true });
    wrapper.addEventListener("pointercancel", onLeave, { passive: true });

    return () => {
      wrapper.removeEventListener("pointerenter", onEnter);
      wrapper.removeEventListener("pointermove", onMove);
      wrapper.removeEventListener("pointerleave", onLeave);
      wrapper.removeEventListener("pointercancel", onLeave);
    };
  }, [grid, listenPointer, requestTick, setTargetFromPointer]);

  const onArtLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (!(img.naturalWidth && img.naturalHeight)) return;
    naturalRef.current = {
      w: img.naturalWidth,
      h: img.naturalHeight,
    };
    let panelCrops: LenticularPanelCrop[] = [];
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
        const layout = resolveLenticularStripLayoutFromRgba(
          data,
          canvas.width,
          canvas.height,
          grid,
          undefined,
          { cropProfile: lenticularCropProfile },
        );
        panelCrops = layout.crops;
        panelCropsRef.current = panelCrops;
        rowBoundsRef.current = layout.rowBounds;
        layoutKeyRef.current = "";
      }
    } catch {
      panelCropsRef.current = null;
      rowBoundsRef.current = null;
    }
    setLoaded(true);
    onLoad?.(img.naturalWidth, img.naturalHeight, panelCrops);
    const wrapper = wrapperRef.current;
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        sizeRef.current = { w: rect.width, h: rect.height };
      }
    }
    applyFrame();
  };

  const layerClass =
    "pointer-events-none absolute inset-0 overflow-hidden will-change-[clip-path]";
  const imgClass = "pointer-events-none absolute max-w-none select-none";

  return (
    <div
      ref={wrapperRef}
      className={cn("relative h-full w-full select-none", className)}
      style={{ width: "100%", height: "100%" }}
      aria-label={alt}
      role="img"
    >
      <div
        ref={sceneRef}
        className="absolute inset-0 overflow-hidden bg-transparent"
        style={{ transformStyle: "preserve-3d" }}
      >
        {isGrid2d ? (
          <>
            <div ref={colFrontRef} className={cn(layerClass, "z-[1]")}>
              <div ref={tlLayerRef} className={cn(layerClass, "z-[1]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={tlRef}
                  src={imageUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className={imgClass}
                  onLoad={onArtLoad}
                />
              </div>
              <div ref={blLayerRef} className={cn(layerClass, "z-[2]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={blRef}
                  src={imageUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className={imgClass}
                />
              </div>
            </div>
            <div ref={colBackRef} className={cn(layerClass, "z-[2]")}>
              <div ref={trLayerRef} className={cn(layerClass, "z-[1]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={trRef}
                  src={imageUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className={imgClass}
                />
              </div>
              <div ref={brLayerRef} className={cn(layerClass, "z-[2]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={brRef}
                  src={imageUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className={imgClass}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div ref={backLayerRef} className={cn(layerClass, "z-[1]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={backRef}
                src={imageUrl}
                alt=""
                aria-hidden
                draggable={false}
                className={imgClass}
              />
            </div>
            <div ref={frontLayerRef} className={cn(layerClass, "z-[2]")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={frontRef}
                src={imageUrl}
                alt=""
                aria-hidden
                draggable={false}
                className={imgClass}
                onLoad={onArtLoad}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});
