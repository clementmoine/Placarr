"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SyntheticEvent,
} from "react";

import { HoloCardImage } from "@/components/HoloCardImage";
import {
  foilLookSuppressed,
  foilSurfacesReady,
} from "@/components/foilFaceReady";
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
import { useFoilIdleLean } from "@/lib/client/hooks/useFoilIdleLean";
import { cn } from "@/lib/shared/utils";

import "@/effects";

/**
 * Product face for foil prints: metadata in, engine out.
 *
 * Callers pass catalogue finish / varnish / masks — never Unity material names
 * and never a backend choice (except the playroom override or grid `css`).
 * Default is WebGL when WebGL2 + resolved material + pool slot allow; otherwise
 * the full CSS stack via `HoloCardImage`. Grids force `backend="css"`; detail
 * and fullscreen leave `auto`. While WebGL loads the face stays empty so the
 * parent card-back skeleton shows — no CSS→canvas flash.
 */

const MAX_TILT = 18;
/**
 * Lorcana dual-frag / `_CosTime` scroll amplitude. Live HoloFoil (Pokémon) does
 * **not** declare `_TimeFactor` — its frags read `_LightDirection` /
 * `_WorldSpaceCameraPos`. Reusing 0.4 there capped lean at ±0.4 and the foil
 * layers barely moved vs the Mac app.
 */
const LORCANA_TIME_FACTOR = 0.4;
/** Live light/camera lean: full edge → ±1 into {@link lightDirectionFromTilt}. */
const LIVE_LEAN_AMPLITUDE = 1;

/**
 * Map a light position (0..100, 50 at rest) to one lean component for
 * `setTilt` / light+camera (or Lorcana `_Tilt` phase).
 *
 * Lorcana Time-scroll uses `_CosTime.w * _TimeFactor` (±timeFactor). Live
 * Pokémon maps the same 0..100 pointer onto ±{@amplitude} so a full
 * card-edge sweep matches the Mac client's visible spectrum / sheen travel.
 */
export function tiltFromLightPercent(
  lightPercent: number,
  amplitude: number = LORCANA_TIME_FACTOR,
): number {
  return ((lightPercent - 50) / 50) * amplitude;
}

/**
 * How far `setTilt` should travel at the card edge.
 *
 * - Lorcana sheets ship `_TimeFactor` (0.33–0.4) for CosTime / tilt-frag phase.
 * - Pokémon Live sheets omit it — use full ±1 so `_LightDirection` /
 *   `_WorldSpaceCameraPos` actually swing (a ±0.4 cap was the “weak tilt”
 *   feel vs TCG Live).
 */
export function foilLeanAmplitude(opts: {
  timeFactor?: number | null;
  hasTimeSibling?: boolean;
}): number {
  if (opts.timeFactor != null && Number.isFinite(opts.timeFactor)) {
    return opts.timeFactor;
  }
  if (opts.hasTimeSibling) return LORCANA_TIME_FACTOR;
  return LIVE_LEAN_AMPLITUDE;
}

/**
 * Which WebGL scroll clock to run while the card is idle vs pointer-driven.
 *
 * TCG Live HoloFoil frags bake `_Time` motif scroll **and** light/view response
 * in a single program. Flipping to `"tilt"` on hover used to unsubscribe the
 * shared clock — `_Time` froze and the foil looked "posed" under the cursor
 * while Live keeps shimmering. Lorcana alone ships a dual sibling
 * (`fragmentTime` / tilt); only then may hover swap programs.
 */
export function foilScrollModeForInteraction(opts: {
  isDriven: boolean;
  /** True when the material has a separate SCROLLMODE_TIME fragment. */
  hasTimeSibling: boolean;
  prefersReducedMotion?: boolean;
}): "time" | "tilt" {
  if (opts.prefersReducedMotion && !opts.isDriven) return "tilt";
  if (opts.hasTimeSibling && opts.isDriven) return "tilt";
  return "time";
}

type FoilCardImageProps = {
  effectPack?: string | null;
  /** Provider-neutral print anchor — packs may resolve finish → dumped recipe. */
  printKey?: string | null;
  /** Catalogue title — Live name join when set+num misses. */
  title?: string | null;
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
  /**
   * Live `foil_mask` (CastAndCure, ReverseLaminate*, …). Packs may enable CC
   * foil layers from it — playroom passes the dumped seed's mask.
   */
  liveFoilMask?: string | null;
  maskUrl?: string | null;
  /** Foil plate, intersected with the coverage mask — see `HoloCardImage`. */
  foilPlateUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
  varnishColor?: string | null;
  /**
   * Pre-resolved CSS look ids (from `variantRendering` / pack.resolveCss).
   * When set, preferred over re-resolving from finish — keeps the grid foil
   * alive even if `effectPack` is briefly missing from a stale print cache.
   */
  cssFinishShaderId?: string | null;
  cssVarnishShaderId?: string | null;
  fit?: "cover" | "contain";
  tuning?: HoloTuning;
  tilt?: boolean;
  trackPointer?: boolean;
  /** Simey `--card-glow` (Radiant type colour). */
  cardGlow?: string | null;
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
  setLeanDegrees: (x: number, y: number) => void;
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
  foilPlateUrl,
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
  cardGlow,
}: {
  imageUrl: string;
  alt: string;
  maskUrl?: string | null;
  foilPlateUrl?: string | null;
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
  cardGlow?: string | null;
}) {
  return (
    <HoloCardImage
      imageUrl={imageUrl}
      alt={alt}
      maskUrl={maskUrl}
      foilPlateUrl={foilPlateUrl}
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
      cardGlow={cardGlow}
      onLoad={onLoad}
      className={className}
    >
      {children}
    </HoloCardImage>
  );
}

const NO_FOIL_CAPS: FoilCapabilities = {
  supportsWebgl2: false,
  supportsAstc: false,
};

function subscribeFoilCaps() {
  return () => {};
}

/**
 * Capabilities must be read on the client: a first render without `document`
 * (SSR) would otherwise cache `supportsWebgl2: false`.
 */
function useFoilCapabilities(): FoilCapabilities {
  return useSyncExternalStore(
    subscribeFoilCaps,
    getFoilCapabilities,
    () => NO_FOIL_CAPS,
  );
}

export function FoilCardImage({
  effectPack: effectPackId,
  printKey,
  title,
  imageUrl,
  alt,
  finish,
  varnishType,
  materialName,
  liveFoilMask,
  maskUrl,
  foilPlateUrl,
  varnishMaskUrl,
  secondVarnishMaskUrl,
  secondVarnishColor,
  varnishColor,
  cssFinishShaderId,
  cssVarnishShaderId,
  fit = "contain",
  tuning,
  tilt = true,
  trackPointer = tilt,
  backend: preference = "auto",
  cardGlow = null,
  onLoad,
  className,
  children,
}: FoilCardImageProps) {
  const pack = getEffectPack(effectPackId);
  const [metaReady, setMetaReady] = useState(typeof window === "undefined");

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/foilMetaLoad")
      .then((m) => m.hydrateFoilMetaFromAssets())
      .finally(() => {
        if (!cancelled) setMetaReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoize: materialForPrint often returns a fresh object (foil_mask /
  // USESECONDTOPLAYER clones). A new identity remounts WebGL every lean tick.
  // `metaReady` re-resolves after browser foil-meta hydrate.
  const material = useMemo(() => {
    void metaReady;
    if (!pack) return null;
    if (materialName) {
      return (
        pack.materialForPrint?.(materialName, {
          secondVarnishMaskUrl,
          foilMask: liveFoilMask,
        }) ?? pack.material(materialName)
      );
    }
    if (finish) {
      return pack.resolveMaterialForPrint(finish, varnishType, {
        secondVarnishMaskUrl,
        printKey,
        title,
        foilMask: liveFoilMask,
      });
    }
    return null;
  }, [
    pack,
    materialName,
    finish,
    varnishType,
    secondVarnishMaskUrl,
    liveFoilMask,
    printKey,
    title,
    metaReady,
  ]);

  const effectiveMaskUrl = maskUrl ?? pack?.fallbackFoilMaskUrl ?? null;
  /**
   * Un matériau qui réclame un masque n'a rien à dessiner sans lui.
   *
   * Le WebGL le refusait déjà (`foilSurfacesReady`), mais la retombée CSS,
   * elle, n'a jamais consulté le masque : elle étalait la finition sur toute
   * la carte au lieu des seules zones foilées. Mieux vaut une carte plate
   * qu'un foil au mauvais endroit — un tirage sans masque n'est pas un
   * tirage sans zones, c'est un tirage dont on ignore les zones.
   */
  const foilMaskMissing = foilLookSuppressed({
    hasMaterial: Boolean(material),
    needsFoilMask: material ? materialNeedsRole(material, "foilMask") : false,
    foilMaskUrl: effectiveMaskUrl,
  });
  const fromPack = pack
    ? pack.resolveCss(finish ?? "", varnishType, {
        foilMask: liveFoilMask,
        printKey,
        title,
      })
    : { finishShaderId: null, varnishShaderId: null };
  // Prefer pack resolve (sees Live foil_mask) when it yields a look; fall back
  // to pre-resolved ids when the pack is briefly missing from a stale cache.
  // Plain leaves (`webgl: false`, Live NonFoil) must stay shader-less even if
  // a stale `finish` prop names another print's foil.
  const cssRecipe =
    material?.webgl === false || foilMaskMissing
      ? { finishShaderId: null, varnishShaderId: null }
      : {
          finishShaderId: fromPack.finishShaderId ?? cssFinishShaderId ?? null,
          varnishShaderId:
            fromPack.varnishShaderId ?? cssVarnishShaderId ?? null,
        };

  const slotId = useId();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebglHandle | null>(null);
  const tiltUniformRef = useRef<readonly [number, number]>([0, 0]);
  const leanDegreesRef = useRef<readonly [number, number]>([0, 0]);

  const [observedInView, setObservedInView] = useState(false);
  const [acquired, setAcquired] = useState(false);
  const foilIdentity = [
    preference,
    materialName,
    finish,
    varnishType,
    effectPackId,
    printKey,
  ].join("\0");
  const [failed, setFailed] = useState(false);
  const [failedFor, setFailedFor] = useState(foilIdentity);
  if (failedFor !== foilIdentity) {
    setFailedFor(foilIdentity);
    setFailed(false);
  }
  const [rendererReady, setRendererReady] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const caps = useFoilCapabilities();
  const surfacesReady = foilSurfacesReady({
    hasMaterial: Boolean(material),
    needsFoilMask: material ? materialNeedsRole(material, "foilMask") : false,
    foilMaskUrl: effectiveMaskUrl,
  });

  /**
   * WebGL is *desired* for this card (material + caps + preference). Visibility
   * and pool are applied separately — the frame must stay mounted whenever
   * this is true so IntersectionObserver can flip `inView`.
   *
   * Grids pass `backend="css"`; detail / fullscreen leave `auto` (WebGL with
   * CSS fallback). `material.webgl === false` (Live NonFoil) stays CSS.
   */
  const webglMaterial = Boolean(material) && material?.webgl !== false;
  const eligible =
    !failed &&
    surfacesReady &&
    selectFoilBackend({
      preference,
      supportsWebgl2: caps.supportsWebgl2,
      hasMaterial: webglMaterial,
      hasPoolSlot: true,
    }) === "webgl";

  useEffect(() => {
    if (!eligible) return;
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => setObservedInView(entry.isIntersecting),
      // Small cushion so a 1px scroll does not thrash pool acquire/release
      // (that read as a blink). Keep it modest — large margins starved HotFoil.
      { rootMargin: "40px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [eligible]);
  const inView = eligible && observedInView;

  // A failed acquire must retry when someone else releases — otherwise the
  // first N cards hog the pool forever and the rest stay on CSS even in view.
  useEffect(() => {
    if (!eligible || !inView) {
      releaseFoilSlot(slotId);
      return;
    }
    const tryAcquire = () => {
      setAcquired(acquireFoilSlot(slotId));
    };
    tryAcquire();
    const unsubscribe = subscribeFoilPool(() => {
      // FIFO handoff may have granted the slot already — sync state.
      if (hasFoilSlot(slotId)) {
        setAcquired(true);
        return;
      }
      tryAcquire();
    });
    return () => {
      unsubscribe();
      releaseFoilSlot(slotId);
    };
  }, [eligible, inView, slotId]);
  const poolOk = eligible && inView && acquired && hasFoilSlot(slotId);

  const useWebgl =
    eligible &&
    inView &&
    poolOk &&
    selectFoilBackend({
      preference,
      supportsWebgl2: caps.supportsWebgl2,
      hasMaterial: webglMaterial,
      hasPoolSlot: poolOk,
    }) === "webgl";

  const deviceTilt = useDeviceTilt(MAX_TILT, trackPointer && useWebgl);
  const deviceLean = deviceTilt.lean;
  const isDriven = isActive || Boolean(deviceLean);

  /** Lorcana dual-frag only — Pokémon keeps one Live frag with `_Time` + light. */
  const hasTimeSibling = Boolean(material?.fragmentTime);
  const leanAmplitude = foilLeanAmplitude({
    timeFactor: material?.floats._TimeFactor,
    hasTimeSibling,
  });

  const applyLean = useCallback(
    (lean: Lean, opts?: { engageTiltProgram?: boolean }) => {
      const xy = [
        tiltFromLightPercent(lean.lightX, leanAmplitude),
        tiltFromLightPercent(lean.lightY, leanAmplitude),
      ] as const;
      tiltUniformRef.current = xy;
      const renderer = rendererRef.current;
      if (renderer) {
        // Dual-frag (Lorcana): hover must flip to the tilt sibling immediately.
        // Single-frag Live (Pokémon): stay on the clock — engageTilt would freeze
        // `_Time` and pose the foil under the cursor.
        if (opts?.engageTiltProgram && hasTimeSibling) {
          renderer.setScrollMode("tilt");
        }
        renderer.setTilt(xy[0], xy[1]);
      }
      // The same lean as an angle, for the shaders that rotate rather than
      // scroll. `tiltX`/`tiltY` are rotations *about* X and Y, so they land on
      // the Euler components of the same name.
      leanDegreesRef.current = [lean.tiltX, lean.tiltY];
      renderer?.setLeanDegrees(lean.tiltX, lean.tiltY);
      const frame = frameRef.current;
      if (frame) {
        frame.style.setProperty("--rotateX", `${lean.tiltY}deg`);
        frame.style.setProperty("--rotateY", `${lean.tiltX}deg`);
      }
    },
    [leanAmplitude, hasTimeSibling],
  );

  // Physical lean follows the same `cos(t)` Time mode uses for the foil, with
  // a release blend so leaving the card is not a snap.
  const { noteLean } = useFoilIdleLean(
    isDriven || !useWebgl || !tilt,
    MAX_TILT,
    (lean) => applyLean(lean),
  );

  useEffect(() => {
    if (!useWebgl || !material || !pack) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setRendererReady(false);

    void (async () => {
      try {
        const { createWebglFoilRenderer } =
          await import("@/core/render/foil/webgl");
        if (cancelled) return;
        const renderer = createWebglFoilRenderer(
          canvas,
          material,
          {
            artUrl: imageUrl,
            foilMaskUrl: effectiveMaskUrl,
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
      } catch (err) {
        // Stay on CSS until the user switches backend / material.
        console.warn("[foil] WebGL init failed", material?.fragment, err);
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
    effectiveMaskUrl,
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
      const [leanX, leanY] = leanDegreesRef.current;
      rendererRef.current?.setLeanDegrees(leanX, leanY);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [useWebgl]);

  useEffect(() => {
    if (!deviceLean || isActive) return;
    noteLean(deviceLean, 0.4);
    applyLean(deviceLean, { engageTiltProgram: true });
  }, [deviceLean, isActive, applyLean, noteLean]);

  useEffect(() => {
    if (!useWebgl || !rendererReady) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mode = foilScrollModeForInteraction({
      isDriven,
      hasTimeSibling,
      prefersReducedMotion: prefersReduced,
    });
    renderer.setScrollMode(mode);
    if (mode === "tilt" && prefersReduced && !isDriven) {
      renderer.setTilt(0, 0);
    }
  }, [useWebgl, rendererReady, isDriven, hasTimeSibling]);

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
      foilPlateUrl={foilPlateUrl}
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
      cardGlow={cardGlow}
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
        const lean = leanFromPointer(
          ((event.clientX - rect.left) / rect.width) * 100,
          ((event.clientY - rect.top) / rect.height) * 100,
          MAX_TILT,
        );
        noteLean(lean);
        applyLean(lean, { engageTiltProgram: true });
      }
    : undefined;

  const reset = trackPointer
    ? () => {
        setIsActive(false);
        // Idle hook eases from the last noted pose — do not snap.
      }
    : undefined;

  // Eligible: keep a stable frame for IntersectionObserver. Without this
  // wrapper, inView never flips and WebGL never starts. Face stays empty until
  // the canvas is ready so the parent card-back skeleton shows (no CSS flash).
  return (
    <div
      ref={frameRef}
      // CSS face owns its pointer + idle; only the WebGL canvas needs the
      // frame (canvas is pointer-events-none).
      onPointerMove={useWebgl ? onPointerMove : undefined}
      onPointerLeave={useWebgl ? reset : undefined}
      onPointerCancel={useWebgl ? reset : undefined}
      className={cn(
        "relative h-full w-full select-none rounded-[inherit]",
        useWebgl && tilt && "[perspective:900px]",
      )}
      aria-busy={useWebgl && !rendererReady ? true : undefined}
    >
      {!useWebgl ? (
        <div className={cn("h-full w-full rounded-[inherit]", className)}>
          {cssFace}
        </div>
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
            "relative h-full w-full rounded-[inherit]",
            // Lorcana dual-frag can ease the canvas tilt; Live single-frag
            // follows the pointer immediately (CSS transition felt like a pose).
            tilt &&
              isDriven &&
              hasTimeSibling &&
              "transition-transform duration-200 ease-out",
          )}
        >
          {/*
            Radius + overflow must be on a node *inside* the tilt transform.
            Same-node `transform` + `overflow:hidden` + `border-radius` fails to
            clip the canvas (sharp corners, rounded shadow only).
          */}
          <div
            className={cn(
              "relative isolate h-full w-full overflow-hidden rounded-[inherit]",
              className,
            )}
          >
            {/*
              Fill the oriented frame edge-to-edge. Aspect lives on
              OrientedMediaFrame / shelf tile — do not re-introduce aspectRatio +
              maxHeight here (that fight clips BREAK faces after rotate).

              `rounded-[inherit]` here too: the canvas asks to inherit the card
              radius, and inside a `preserve-3d` scene that own rounded box is
              the only thing that still clips it.
            */}
            <div className="relative h-full w-full rounded-[inherit]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={rendererReady ? alt : ""}
                aria-hidden={!rendererReady}
                draggable={false}
                onLoad={onLoad}
                className="pointer-events-none h-full w-full object-fill opacity-0"
              />
              <canvas
                ref={canvasRef}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full rounded-[inherit]",
                  rendererReady ? "opacity-100" : "opacity-0",
                )}
              />
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
