"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

import { HoloCardImage } from "@/components/HoloCardImage";
import {
  acquireFoilSlot,
  getEffectPack,
  getFoilCapabilities,
  hasFoilSlot,
  releaseFoilSlot,
  selectFoilBackend,
  subscribeFoilPool,
  type FoilBackendPreference,
  type FoilCapabilities,
  type FoilMaterial,
  foilRenderScale,
} from "@/core/render/foil";
import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import {
  holoShader,
  varnishShader as varnishShaderFor,
  type HoloTuning,
} from "@/core/render/holoShaders";
import { useDeviceTilt } from "@/lib/client/hooks/useDeviceTilt";
import { cn } from "@/lib/shared/utils";

import "@/effects";

/**
 * Product face for foil prints: metadata in, engine out.
 *
 * Callers pass catalogue finish / varnish / masks — never Unity material names
 * and never a backend choice (except the playroom override or grid `css`).
 * Default is WebGL when WebGL2 + resolved material + pool slot allow; otherwise
 * the full CSS stack via `HoloCardImage`. Grids force `backend="css"`; detail
 * and fullscreen leave `auto`. CSS paints first while WebGL loads, then
 * unmounts once the canvas is ready — no permanent double render.
 */

const MAX_TILT = 18;
/** Fallback when a material does not declare `_TimeFactor` (almost all do: 0.4). */
const DEFAULT_TIME_FACTOR = 0.4;

/**
 * Map a light position (0..100, 50 at rest) to one `_Tilt` component.
 *
 * The app's fragments scroll with `_Tilt.x + _Tilt.y` — the same channel Time
 * mode drives via `_CosTime.w * _TimeFactor` (±timeFactor). Each axis alone
 * must reach ±timeFactor at the card edge; halving it left a normal horizontal
 * sweep at half the idle travel.
 */
export function tiltFromLightPercent(
  lightPercent: number,
  timeFactor: number = DEFAULT_TIME_FACTOR,
): number {
  return ((lightPercent - 50) / 50) * timeFactor;
}

type FoilCardImageProps = {
  effectPack?: string | null;
  imageUrl: string;
  alt: string;
  /** Catalogue finish name (e.g. Magma), not a shader id. */
  finish?: string | null;
  varnishType?: string | null;
  /**
   * Exact dumped material (playroom). When set, WebGL uses this material
   * instead of finish+varnish resolution — varnish-only materials have no finish.
   */
  materialName?: string | null;
  maskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
  varnishColor?: string | null;
  fit?: "cover" | "contain";
  tuning?: HoloTuning;
  tilt?: boolean;
  trackPointer?: boolean;
  /** Playroom override. Product leaves `auto`. */
  backend?: FoilBackendPreference;
  /** Fired when the artwork finishes loading (for letterbox edge bleed, etc.). */
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  className?: string;
  children?: React.ReactNode;
};

type WebglHandle = {
  ready: Promise<void>;
  setTilt: (x: number, y: number) => void;
  setScrollMode: (mode: "time" | "tilt") => void;
  setDeviceRotationDegrees: (degrees: number) => void;
  destroy: () => void;
};

function materialNeedsRole(
  material: FoilMaterial,
  role: "foilMask" | "varnishMask" | "secondVarnishMask",
): boolean {
  return Object.values(material.textures).some(
    (binding) => binding.role === role,
  );
}

function parseCssColor(
  color: string | null | undefined,
): readonly [number, number, number, number] | null {
  if (!color) return null;
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const value = Number.parseInt(full, 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    1,
  ];
}

function CssFoilFace({
  imageUrl,
  alt,
  maskUrl,
  varnishMaskUrl,
  secondVarnishMaskUrl,
  secondVarnishColor,
  varnishColor,
  finishShaderId,
  varnishShaderId,
  fit,
  tuning,
  tilt,
  trackPointer,
  onLoad,
  className,
  children,
}: {
  imageUrl: string;
  alt: string;
  maskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
  varnishColor?: string | null;
  finishShaderId: string | null;
  varnishShaderId: string | null;
  fit?: "cover" | "contain";
  tuning?: HoloTuning;
  tilt?: boolean;
  trackPointer?: boolean;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <HoloCardImage
      imageUrl={imageUrl}
      alt={alt}
      maskUrl={maskUrl}
      varnishMaskUrl={varnishMaskUrl}
      secondVarnishMaskUrl={secondVarnishMaskUrl}
      secondVarnishColor={secondVarnishColor}
      varnishColor={varnishColor}
      fit={fit}
      shader={holoShader(finishShaderId)}
      varnishShader={varnishShaderFor(varnishShaderId)}
      tuning={tuning}
      tilt={tilt}
      trackPointer={trackPointer}
      onLoad={onLoad}
      className={className}
    >
      {children}
    </HoloCardImage>
  );
}

/**
 * Capabilities must be read after mount: a first render without `document`
 * (SSR) would otherwise cache `supportsWebgl2: false` for the session if the
 * module were ever shared — and more importantly we need a client re-render
 * once the probe has a real canvas.
 */
function useFoilCapabilities(): FoilCapabilities {
  const [caps, setCaps] = useState<FoilCapabilities>({
    supportsWebgl2: false,
    supportsAstc: false,
  });
  useEffect(() => {
    setCaps(getFoilCapabilities());
  }, []);
  return caps;
}

export function FoilCardImage({
  effectPack: effectPackId,
  imageUrl,
  alt,
  finish,
  varnishType,
  materialName,
  maskUrl,
  varnishMaskUrl,
  secondVarnishMaskUrl,
  secondVarnishColor,
  varnishColor,
  fit = "contain",
  tuning,
  tilt = true,
  trackPointer = tilt,
  backend: preference = "auto",
  onLoad,
  className,
  children,
}: FoilCardImageProps) {
  const pack = getEffectPack(effectPackId);
  const cssRecipe = pack
    ? pack.resolveCss(finish ?? "", varnishType)
    : { finishShaderId: null, varnishShaderId: null };
  const material = pack
    ? materialName
      ? (pack.materialForPrint?.(materialName, { secondVarnishMaskUrl }) ??
        pack.material(materialName))
      : finish
        ? pack.resolveMaterialForPrint(finish, varnishType, {
            secondVarnishMaskUrl,
          })
        : null
    : null;

  const slotId = useId();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebglHandle | null>(null);
  const tiltUniformRef = useRef<readonly [number, number]>([0, 0]);

  const [inView, setInView] = useState(false);
  const [poolOk, setPoolOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [artRatio, setArtRatio] = useState<string | null>(null);
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);
  if (prevImageUrl !== imageUrl) {
    setPrevImageUrl(imageUrl);
    setArtRatio(null);
  }

  const caps = useFoilCapabilities();
  const surfacesReady = Boolean(
    material &&
      (!materialNeedsRole(material, "foilMask") || maskUrl) &&
      (!materialNeedsRole(material, "varnishMask") || varnishMaskUrl) &&
      (!materialNeedsRole(material, "secondVarnishMask") ||
        secondVarnishMaskUrl),
  );

  /**
   * WebGL is *desired* for this card (material + caps + preference). Visibility
   * and pool are applied separately — the frame must stay mounted whenever
   * this is true so IntersectionObserver can flip `inView`.
   *
   * Grids pass `backend="css"`; detail / fullscreen leave `auto` (WebGL with
   * CSS fallback).
   */
  const eligible =
    !failed &&
    surfacesReady &&
    selectFoilBackend({
      preference,
      supportsWebgl2: caps.supportsWebgl2,
      hasMaterial: Boolean(material),
      hasPoolSlot: true,
    }) === "webgl";

  useEffect(() => {
    if (!eligible) {
      setInView(false);
      return;
    }
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "25%" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [eligible]);

  // A failed acquire must retry when someone else releases — otherwise the
  // first N cards hog the pool forever and the rest stay on CSS even in view.
  useEffect(() => {
    if (!eligible || !inView) {
      releaseFoilSlot(slotId);
      setPoolOk(false);
      return;
    }
    const tryAcquire = () => {
      setPoolOk(acquireFoilSlot(slotId));
    };
    tryAcquire();
    const unsubscribe = subscribeFoilPool(() => {
      if (!hasFoilSlot(slotId)) tryAcquire();
    });
    return () => {
      unsubscribe();
      releaseFoilSlot(slotId);
      setPoolOk(false);
    };
  }, [eligible, inView, slotId]);

  // Allow a later mount / backend switch to retry after a compile failure.
  useEffect(() => {
    setFailed(false);
  }, [preference, materialName, finish, varnishType, effectPackId]);

  const useWebgl =
    eligible &&
    inView &&
    poolOk &&
    selectFoilBackend({
      preference,
      supportsWebgl2: caps.supportsWebgl2,
      hasMaterial: Boolean(material),
      hasPoolSlot: poolOk,
    }) === "webgl";

  const deviceTilt = useDeviceTilt(MAX_TILT, trackPointer && useWebgl);
  const deviceLean = deviceTilt.lean;
  const isDriven = isActive || Boolean(deviceLean);

  const timeFactor = material?.floats._TimeFactor ?? DEFAULT_TIME_FACTOR;

  const setShaderTilt = useCallback((xy: readonly [number, number]) => {
    tiltUniformRef.current = xy;
    rendererRef.current?.setTilt(xy[0], xy[1]);
  }, []);

  const applyLean = useCallback(
    (lean: Lean) => {
      setShaderTilt([
        tiltFromLightPercent(lean.lightX, timeFactor),
        tiltFromLightPercent(lean.lightY, timeFactor),
      ]);
      const frame = frameRef.current;
      if (frame) {
        frame.style.setProperty("--rotateX", `${lean.tiltY}deg`);
        frame.style.setProperty("--rotateY", `${lean.tiltX}deg`);
      }
    },
    [setShaderTilt, timeFactor],
  );

  useEffect(() => {
    if (!useWebgl || !material || !pack) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setRendererReady(false);

    void (async () => {
      try {
        const { createWebglFoilRenderer } = await import(
          "@/core/render/foil/webgl"
        );
        if (cancelled) return;
        const renderer = createWebglFoilRenderer(
          canvas,
          material,
          {
            artUrl: imageUrl,
            foilMaskUrl: maskUrl,
            varnishMaskUrl,
            secondVarnishMaskUrl,
            hotFoilColor: parseCssColor(varnishColor),
            secondHotFoilColor: parseCssColor(secondVarnishColor),
          },
          pack.assetBase,
        );
        if (cancelled) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        await renderer.ready;
        if (!cancelled && rendererRef.current === renderer) {
          setRendererReady(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      const renderer = rendererRef.current;
      rendererRef.current = null;
      renderer?.destroy();
      setRendererReady(false);
    };
  }, [
    useWebgl,
    material,
    pack,
    imageUrl,
    maskUrl,
    varnishMaskUrl,
    secondVarnishMaskUrl,
    varnishColor,
    secondVarnishColor,
  ]);

  useEffect(() => {
    if (!useWebgl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      // Scaled to what the card is actually worth reading at — see
      // `foilRenderScale`. A grid thumbnail at x2 paid four times the fill for
      // rules text four pixels tall.
      const scale = foilRenderScale(width, window.devicePixelRatio || 1);
      const nextWidth = Math.round(width * scale);
      const nextHeight = Math.round(height * scale);
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const [x, y] = tiltUniformRef.current;
      rendererRef.current?.setTilt(x, y);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [useWebgl]);

  useEffect(() => {
    if (!deviceLean || isActive) return;
    applyLean(deviceLean);
  }, [deviceLean, isActive, applyLean]);

  useEffect(() => {
    if (!useWebgl || !rendererReady) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (
      !isDriven &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      renderer.setScrollMode("tilt");
      setShaderTilt([0, 0]);
      return;
    }
    renderer.setScrollMode(isDriven ? "tilt" : "time");
  }, [useWebgl, rendererReady, isDriven, setShaderTilt]);

  useEffect(() => {
    if (!useWebgl || !rendererReady) return;
    if (deviceTilt.alpha == null) return;
    rendererRef.current?.setDeviceRotationDegrees(deviceTilt.alpha);
  }, [useWebgl, rendererReady, deviceTilt.alpha]);

  const cssFace = (
    <CssFoilFace
      imageUrl={imageUrl}
      alt={alt}
      maskUrl={maskUrl}
      varnishMaskUrl={varnishMaskUrl}
      secondVarnishMaskUrl={secondVarnishMaskUrl}
      secondVarnishColor={secondVarnishColor}
      varnishColor={varnishColor}
      finishShaderId={cssRecipe.finishShaderId}
      varnishShaderId={cssRecipe.varnishShaderId}
      fit={fit}
      tuning={tuning}
      tilt={tilt}
      trackPointer={trackPointer}
      onLoad={onLoad}
      className={eligible ? undefined : className}
    >
      {!eligible ? children : null}
    </CssFoilFace>
  );

  // No WebGL attempt: preference CSS, missing material/surfaces, or failed.
  if (!eligible) {
    return cssFace;
  }

  const onPointerMove = trackPointer
    ? (event: React.PointerEvent) => {
        const frame = frameRef.current;
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        setIsActive(true);
        applyLean(
          leanFromPointer(
            ((event.clientX - rect.left) / rect.width) * 100,
            ((event.clientY - rect.top) / rect.height) * 100,
            MAX_TILT,
          ),
        );
      }
    : undefined;

  const reset = trackPointer
    ? () => {
        setIsActive(false);
      }
    : undefined;

  // Eligible: keep a stable frame for IntersectionObserver. CSS underneath
  // until the canvas is ready; without this wrapper, inView never flips and
  // WebGL never starts.
  return (
    <div
      ref={frameRef}
      onPointerMove={useWebgl ? onPointerMove : undefined}
      onPointerLeave={useWebgl ? reset : undefined}
      onPointerCancel={useWebgl ? reset : undefined}
      style={
        useWebgl
          ? ({
              "--rotateX": "0deg",
              "--rotateY": "0deg",
            } as React.CSSProperties)
          : undefined
      }
      className={cn(
        "relative h-full w-full select-none rounded-[inherit]",
        useWebgl && tilt && "[perspective:900px]",
        className,
      )}
    >
      {!useWebgl ? (
        cssFace
      ) : (
        <div
          style={
            tilt
              ? {
                  transform: "rotateX(var(--rotateY)) rotateY(var(--rotateX))",
                  willChange: "transform",
                }
              : undefined
          }
          className={cn(
            "relative isolate h-full w-full overflow-hidden rounded-[inherit]",
            tilt &&
              (isDriven
                ? "transition-transform duration-200 ease-out"
                : "holo-idle-tilt"),
          )}
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <div
              className="relative"
              style={
                artRatio
                  ? { aspectRatio: artRatio, width: "100%", maxHeight: "100%" }
                  : { width: "100%", height: "100%" }
              }
            >
              {/*
                CSS paints first; once WebGL is ready we unmount it so we do not
                keep idle sheen layers + mask blobs under an opaque canvas.
              */}
              {!rendererReady && (
                <div className="absolute inset-0">
                  <CssFoilFace
                    imageUrl={imageUrl}
                    alt={alt}
                    maskUrl={maskUrl}
                    varnishMaskUrl={varnishMaskUrl}
                    secondVarnishMaskUrl={secondVarnishMaskUrl}
                    secondVarnishColor={secondVarnishColor}
                    varnishColor={varnishColor}
                    finishShaderId={cssRecipe.finishShaderId}
                    varnishShaderId={cssRecipe.varnishShaderId}
                    fit={fit}
                    tuning={tuning}
                    tilt={false}
                    trackPointer={false}
                    onLoad={onLoad}
                  />
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={rendererReady ? alt : ""}
                aria-hidden={!rendererReady}
                draggable={false}
                onLoad={(event) => {
                  const art = event.currentTarget;
                  if (art.naturalWidth && art.naturalHeight) {
                    setArtRatio(`${art.naturalWidth} / ${art.naturalHeight}`);
                  }
                  onLoad?.(event);
                }}
                className="pointer-events-none h-full w-full object-contain opacity-0"
              />
              <canvas
                ref={canvasRef}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-150",
                  rendererReady ? "opacity-100" : "opacity-0",
                )}
              />
            </div>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
