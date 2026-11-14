"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { keepCasePlasticRecipe, usesKeepCaseShell } from "@/core/enrich/media/keepCasePlastic";
import { cn } from "@/lib/shared/utils";

/** Keep the box readable — never belly-up. */
export const BOX_PITCH_LIMIT = 32;
const DRAG_SENSITIVITY = 0.45;
const KEY_STEP = 14;
const AUTO_SPIN_SPEED = 0.18;
const IDLE_RESUME_MS = 2000;
const FLICK_WINDOW_MS = 60;
const MOMENTUM_FRAMES = 12;
const MOMENTUM_MAX = 540;
const DEFAULT_FRONT_RATIO = 0.715;
const DEFAULT_SPINE_RATIO = 0.12;
const MAX_SPINE_RATIO = 0.3;
/** Soft keep-case corner. */
const KEEP_CASE_RADIUS_PX = 6;
/** Cardboard retail boxes stay closer to square. */
const CARDBOARD_RADIUS_PX = 2;
/**
 * Cover insert is one wraparound sheet (front–spine–back). Keep-case trays
 * leave plastic lips at top/bottom + opening edge — never on the spine seam.
 */
const COVER_LIP_Y_FRAC = 0.018;
const COVER_LIP_OPENING_FRAC = 0.022;
/** Expand each face slightly so rounded corners overlap instead of showing through. */
const FACE_OVERLAP_PX = 1.5;
/**
 * Inset of the opaque square-cornered core. Outer faces keep their radius; the
 * core sits just inside so corner AA blends against shell plastic, not the page.
 */
const CORE_INSET_PX = 1;

/** Kraft cardboard for non-keep-case retail boxes (N64, Game Boy…). */
const CARDBOARD = {
  base: "oklch(0.78 0.03 85)",
  highlight: "oklch(0.88 0.025 85)",
  shade: "oklch(0.62 0.035 75)",
} as const;

export function clampBoxPitch(pitch: number, limit = BOX_PITCH_LIMIT): number {
  return Math.max(-limit, Math.min(limit, pitch));
}

/**
 * Depth as a fraction of the box edge the spine's long side maps onto.
 * Portrait spines (tall) → depth vs height; landscape (N64 strip) → vs width.
 */
export function spineDepthFraction(
  naturalWidth: number,
  naturalHeight: number,
): { landscape: boolean; ratio: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { landscape: false, ratio: DEFAULT_SPINE_RATIO };
  }
  const landscape = naturalWidth > naturalHeight;
  const ratio = Math.min(
    Math.min(naturalWidth, naturalHeight) /
      Math.max(naturalWidth, naturalHeight),
    MAX_SPINE_RATIO,
  );
  return { landscape, ratio };
}

export function boxDimensions(
  widthPx: number,
  frontRatio: number,
  spineRatio: number,
  spineLandscape: boolean,
): { heightPx: number; depthPx: number } {
  const heightPx = frontRatio > 0 ? widthPx / frontRatio : 0;
  const depthPx =
    (spineLandscape ? widthPx : heightPx) * spineRatio;
  return { heightPx, depthPx };
}

export type GameBox3DProps = {
  front: string;
  back: string;
  spine: string;
  alt?: string;
  /** Video-game platform key → keep-case plastic tint (PS2 blue, Switch red…). */
  platformKey?: string | null;
  /** Slow idle yaw when the pointer is quiet. Honours prefers-reduced-motion. */
  autoSpin?: boolean;
  initialYaw?: number;
  initialPitch?: number;
  className?: string;
  /** Front failed to decode — parent should fall back to a flat cover. */
  onError?: () => void;
};

/**
 * Fake-but-believable 3D game box from three flat scans (front, back, spine).
 *
 * Keep-case platforms: polycarbonate shell, printed insert with lips, opening
 * slit + finger notch. Cardboard-era platforms: spine art wraps all four edge
 * faces (ROMM-style), full-bleed covers, no plastic tray. Proportions come from
 * the artwork — chunky N64 and slim DS both look right without per-platform
 * tuning.
 */
export function GameBox3D({
  front,
  back,
  spine,
  alt = "",
  platformKey = null,
  autoSpin = true,
  initialYaw = 32,
  initialPitch = -6,
  className,
  onError,
}: GameBox3DProps) {
  const keepCase = usesKeepCaseShell(platformKey);
  const shell = keepCase ? keepCasePlasticRecipe(platformKey) : CARDBOARD;
  const caseRadius = keepCase ? KEEP_CASE_RADIUS_PX : CARDBOARD_RADIUS_PX;
  const rootRef = useRef<HTMLDivElement>(null);
  const frontImgRef = useRef<HTMLImageElement>(null);
  const spineImgRef = useRef<HTMLImageElement>(null);

  const [yaw, setYaw] = useState(initialYaw);
  const [pitch, setPitch] = useState(initialPitch);
  const [widthPx, setWidthPx] = useState(0);
  const [frontRatio, setFrontRatio] = useState(DEFAULT_FRONT_RATIO);
  const [spineRatio, setSpineRatio] = useState(DEFAULT_SPINE_RATIO);
  const [spineLandscape, setSpineLandscape] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [coasting, setCoasting] = useState(false);
  const [autoSpinning, setAutoSpinning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const lastInteractAt = useRef(0);
  const lastMoveAt = useRef(0);
  const dragPointerId = useRef<number | null>(null);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const velX = useRef(0);
  const velY = useRef(0);

  const markInteract = useCallback(() => {
    lastInteractAt.current = performance.now();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidthPx(w);
    });
    ro.observe(el);
    setWidthPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const measureFront = useCallback((img: HTMLImageElement | null) => {
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setFrontRatio(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  const measureSpine = useCallback((img: HTMLImageElement | null) => {
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const measured = spineDepthFraction(img.naturalWidth, img.naturalHeight);
      setSpineLandscape(measured.landscape);
      setSpineRatio(measured.ratio);
    }
  }, []);

  useEffect(() => {
    measureFront(frontImgRef.current);
    measureSpine(spineImgRef.current);
  }, [front, spine, measureFront, measureSpine]);

  // Idle auto-spin + keep refs live without re-binding listeners every frame.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const idle = performance.now() - lastInteractAt.current > IDLE_RESUME_MS;
      const spin =
        autoSpin &&
        !reducedMotion &&
        !dragging &&
        dragPointerId.current === null &&
        idle;
      setAutoSpinning(spin);
      if (spin) {
        setCoasting(false);
        setYaw((y) => y + AUTO_SPIN_SPEED);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoSpin, reducedMotion, dragging]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current !== null) return;
    // Keep page sibling-swipe from stealing this drag (mobile touch).
    e.stopPropagation();
    dragPointerId.current = e.pointerId;
    setDragging(true);
    setCoasting(false);
    velX.current = 0;
    velY.current = 0;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    markInteract();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== dragPointerId.current) return;
    velX.current = e.clientX - lastX.current;
    velY.current = e.clientY - lastY.current;
    setYaw((y) => y + velX.current * DRAG_SENSITIVITY);
    setPitch((p) =>
      clampBoxPitch(p - velY.current * DRAG_SENSITIVITY),
    );
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    lastMoveAt.current = performance.now();
    markInteract();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== dragPointerId.current) return;
    dragPointerId.current = null;
    setDragging(false);
    if (performance.now() - lastMoveAt.current < FLICK_WINDOW_MS) {
      const coast = (v: number) =>
        Math.max(
          -MOMENTUM_MAX,
          Math.min(MOMENTUM_MAX, v * DRAG_SENSITIVITY * MOMENTUM_FRAMES),
        );
      const dy = coast(velX.current);
      const dp = coast(-velY.current);
      if (Math.abs(dy) > 1 || Math.abs(dp) > 1) {
        setCoasting(true);
        setYaw((y) => y + dy);
        setPitch((p) => clampBoxPitch(p + dp));
      }
    }
    velX.current = 0;
    velY.current = 0;
    markInteract();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowLeft":
        setYaw((y) => y - KEY_STEP);
        break;
      case "ArrowRight":
        setYaw((y) => y + KEY_STEP);
        break;
      case "ArrowUp":
        setPitch((p) => clampBoxPitch(p - KEY_STEP));
        break;
      case "ArrowDown":
        setPitch((p) => clampBoxPitch(p + KEY_STEP));
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCoasting(false);
    markInteract();
  };

  const { heightPx, depthPx } = boxDimensions(
    widthPx,
    frontRatio,
    spineRatio,
    spineLandscape,
  );

  const liveMotion = dragging || autoSpinning;
  const boxTransition = liveMotion
    ? "none"
    : coasting
      ? "transform 0.9s cubic-bezier(0.16, 1, 0.3, 1)"
      : "transform 0.28s ease-out";

  // Overlap scales with radius so AA fringes still meet on soft keep-case corners.
  const faceOverlap = Math.max(FACE_OVERLAP_PX, caseRadius * 0.55);

  const faceBase: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    backfaceVisibility: "hidden",
    overflow: "hidden",
    pointerEvents: "none",
    borderRadius: caseRadius,
    // Opaque fill — rounded 3D faces otherwise AA to black at seams.
    backgroundColor: shell.base,
  };

  const frontStyle: CSSProperties = {
    ...faceBase,
    width: widthPx + faceOverlap,
    height: heightPx + faceOverlap,
    transform: `translate(-50%, -50%) translateZ(${depthPx / 2}px)`,
  };
  const backStyle: CSSProperties = {
    ...faceBase,
    width: widthPx + faceOverlap,
    height: heightPx + faceOverlap,
    transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${depthPx / 2}px)`,
  };

  const leftAlt = spineLandscape;
  const leftStyle: CSSProperties = {
    ...faceBase,
    width: (leftAlt ? heightPx : depthPx) + faceOverlap,
    height: (leftAlt ? depthPx : heightPx) + faceOverlap,
    transform: `translate(-50%, -50%) rotateY(-90deg) translateZ(${widthPx / 2}px)${leftAlt ? " rotate(90deg)" : ""}`,
  };
  const rightStyle: CSSProperties = {
    ...faceBase,
    width: (leftAlt ? heightPx : depthPx) + faceOverlap,
    height: (leftAlt ? depthPx : heightPx) + faceOverlap,
    transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${widthPx / 2}px)${leftAlt ? " rotate(90deg)" : ""}`,
  };

  const topAlt = !spineLandscape;
  const topStyle: CSSProperties = {
    ...faceBase,
    width: (topAlt ? depthPx : widthPx) + faceOverlap,
    height: (topAlt ? widthPx : depthPx) + faceOverlap,
    transform: `translate(-50%, -50%) rotateX(90deg) translateZ(${heightPx / 2}px)${topAlt ? " rotate(90deg)" : ""}`,
  };
  const bottomStyle: CSSProperties = {
    ...faceBase,
    width: (topAlt ? depthPx : widthPx) + faceOverlap,
    height: (topAlt ? widthPx : depthPx) + faceOverlap,
    transform: `translate(-50%, -50%) rotateX(-90deg) translateZ(${heightPx / 2}px)${topAlt ? " rotate(90deg)" : ""}`,
  };

  /**
   * Square-cornered opaque core just inside the outer faces. Rounded-face AA
   * otherwise composites against the page (near-black) → dark corner fringes.
   * Radius on the outer faces is unchanged.
   */
  const coreW = Math.max(0, widthPx - CORE_INSET_PX * 2);
  const coreH = Math.max(0, heightPx - CORE_INSET_PX * 2);
  const coreD = Math.max(0, depthPx - CORE_INSET_PX * 2);
  const coreFace = (
    width: number,
    height: number,
    transform: string,
  ): CSSProperties => ({
    position: "absolute",
    top: "50%",
    left: "50%",
    width,
    height,
    transform: `translate(-50%, -50%) ${transform}`,
    backgroundColor: shell.base,
    backfaceVisibility: "hidden",
    pointerEvents: "none",
  });

  // Keep-case lips; cardboard prints go edge-to-edge.
  const lipY = keepCase ? Math.max(2, heightPx * COVER_LIP_Y_FRAC) : 0;
  const lipOpening = keepCase
    ? Math.max(2, widthPx * COVER_LIP_OPENING_FRAC)
    : 0;
  /** Hairline seam on top / bottom / opening (keep-case only). */
  const grooveW = Math.min(2.5, Math.max(1.25, depthPx * 0.035));
  /**
   * Finger recess on the opening edge — elongated stadium with rounded caps
   * (DVD keep-case thumb notch). Top/bottom keep a thin seam instead.
   */
  const fingerW = Math.min(depthPx * 0.72, Math.max(8, depthPx * 0.62));
  const fingerH = Math.max(grooveW * 4, heightPx * 0.78);
  /** Mid-depth details; slight outward nudge avoids z-fighting with plastic. */
  const grooveNudge = 0.4;

  /** Fill (not cover): cover crops spine/back scans and desyncs the wraparound. */
  const artClass = "size-full object-fill object-center";

  /**
   * Frame for the printed insert. Sized in px from box geometry so front, back
   * and spine share an identical height band (edge-to-edge wraparound).
   * `opening`: local edge at the case opening (front=right, back=left).
   */
  const insertFrame = (
    opening: "right" | "left" | "none",
  ): CSSProperties => ({
    position: "absolute",
    top: lipY,
    bottom: lipY,
    left: opening === "left" ? lipOpening : 0,
    right: opening === "right" ? lipOpening : 0,
    overflow: "hidden",
    backgroundColor: shell.base,
    boxShadow: keepCase
      ? "inset 0 0 0 1px color-mix(in oklch, black 10%, transparent)"
      : undefined,
  });

  /** Landscape spine face is rotated 90° — lips on local X → box top/bottom. */
  const spineInsertFrame = (): CSSProperties =>
    leftAlt && keepCase
      ? {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: lipY,
          right: lipY,
          overflow: "hidden",
          backgroundColor: shell.base,
          boxShadow:
            "inset 0 0 0 1px color-mix(in oklch, black 10%, transparent)",
        }
      : leftAlt
        ? {
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            backgroundColor: shell.base,
          }
        : insertFrame("none");

  /** Face shell fill — polycarbonate keep-case or kraft cardboard. */
  const shellFace = (): CSSProperties => ({
    backgroundColor: shell.base,
    backgroundImage: `
      linear-gradient(
        160deg,
        ${shell.highlight} 0%,
        ${shell.base} 42%,
        ${shell.shade} 100%
      )`,
    boxShadow: keepCase
      ? `
      inset 0 0 0 1px color-mix(in oklch, ${shell.highlight} 35%, transparent),
      inset 0 0 10px color-mix(in oklch, ${shell.shade} 55%, transparent)`
      : `
      inset 0 0 0 1px color-mix(in oklch, ${shell.highlight} 25%, transparent),
      inset 0 0 6px color-mix(in oklch, ${shell.shade} 35%, transparent)`,
  });

  /** Hairline seam for top / bottom / opening edges (mid-depth). */
  const grooveEdge = (axis: "top" | "bottom" | "right"): CSSProperties => {
    const base: CSSProperties = {
      position: "absolute",
      top: "50%",
      left: "50%",
      pointerEvents: "none",
      background: `
        linear-gradient(
          180deg,
          transparent 0%,
          oklch(0.1 0 0 / 0.3) 28%,
          oklch(0.05 0 0 / 0.75) 48%,
          oklch(0.04 0 0 / 0.85) 52%,
          oklch(0.1 0 0 / 0.3) 72%,
          transparent 100%
        )`,
      boxShadow: `
        inset 0 0 0 1px oklch(0.02 0 0 / 0.45),
        inset 0 1px 1px color-mix(in oklch, black 40%, transparent)`,
    };
    if (axis === "right") {
      return {
        ...base,
        width: grooveW,
        height: heightPx,
        background: `
          linear-gradient(
            90deg,
            transparent 0%,
            oklch(0.1 0 0 / 0.3) 28%,
            oklch(0.05 0 0 / 0.75) 48%,
            oklch(0.04 0 0 / 0.85) 52%,
            oklch(0.1 0 0 / 0.3) 72%,
            transparent 100%
          )`,
        boxShadow: `
          inset 0 0 0 1px oklch(0.02 0 0 / 0.45),
          inset 1px 0 1px color-mix(in oklch, black 40%, transparent)`,
        transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${widthPx / 2 + grooveNudge}px)`,
      };
    }
    return {
      ...base,
      width: widthPx,
      height: grooveW,
      transform: `translate(-50%, -50%) rotateX(${axis === "top" ? 90 : -90}deg) translateZ(${heightPx / 2 + grooveNudge}px)`,
    };
  };

  /** Opening-edge finger notch — recessed stadium, rounded caps. */
  const fingerRecess = (): CSSProperties => ({
    position: "absolute",
    top: "50%",
    left: "50%",
    width: fingerW,
    height: fingerH,
    borderRadius: 9999,
    pointerEvents: "none",
    background: `
      linear-gradient(
        90deg,
        color-mix(in oklch, ${shell.shade} 55%, ${shell.base}) 0%,
        color-mix(in oklch, ${shell.shade} 70%, black) 45%,
        color-mix(in oklch, ${shell.shade} 78%, black) 50%,
        color-mix(in oklch, ${shell.shade} 70%, black) 55%,
        color-mix(in oklch, ${shell.shade} 55%, ${shell.base}) 100%
      )`,
    boxShadow: `
      inset 0 0 0 1px color-mix(in oklch, black 28%, transparent),
      inset 1px 0 3px color-mix(in oklch, black 28%, transparent),
      inset -1px 0 2px color-mix(in oklch, ${shell.highlight} 22%, transparent),
      inset 0 2px 3px color-mix(in oklch, black 18%, transparent),
      inset 0 -2px 3px color-mix(in oklch, black 18%, transparent)`,
    transform: `translate(-50%, -50%) rotateY(90deg) translateZ(${widthPx / 2 + grooveNudge + 0.35}px)`,
  });

  const spineArt = (opts?: { measure?: boolean }) => (
    <div style={spineInsertFrame()}>
      <img
        ref={opts?.measure ? spineImgRef : undefined}
        src={spine}
        alt=""
        draggable={false}
        className={artClass}
        onLoad={
          opts?.measure
            ? (e) => measureSpine(e.currentTarget)
            : undefined
        }
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={alt || undefined}
      tabIndex={0}
      data-no-item-swipe=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
      className={cn(
        "relative w-full overflow-visible select-none touch-none outline-none cursor-grab active:cursor-grabbing",
        "focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        className,
      )}
      style={{ aspectRatio: String(frontRatio) }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-[12%] right-[12%] bottom-[-4%] h-[10%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.38),transparent_70%)] blur-md"
      />
      <div
        className="absolute inset-0 grid place-items-center"
        style={{ perspective: 1400 }}
      >
        <div
          className="relative size-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)`,
            transition: reducedMotion ? "none" : boxTransition,
            willChange: "transform",
          }}
        >
          {/* Opaque square core — AA at outer rounded corners blends against
              shell plastic instead of the page (near-black). Radius unchanged. */}
          <div
            aria-hidden
            data-box-core="front"
            style={coreFace(coreW, coreH, `translateZ(${coreD / 2}px)`)}
          />
          <div
            aria-hidden
            data-box-core="back"
            style={coreFace(
              coreW,
              coreH,
              `rotateY(180deg) translateZ(${coreD / 2}px)`,
            )}
          />
          <div
            aria-hidden
            data-box-core="left"
            style={coreFace(
              coreD,
              coreH,
              `rotateY(-90deg) translateZ(${coreW / 2}px)`,
            )}
          />
          <div
            aria-hidden
            data-box-core="right"
            style={coreFace(
              coreD,
              coreH,
              `rotateY(90deg) translateZ(${coreW / 2}px)`,
            )}
          />
          <div
            aria-hidden
            data-box-core="top"
            style={coreFace(
              coreW,
              coreD,
              `rotateX(90deg) translateZ(${coreH / 2}px)`,
            )}
          />
          <div
            aria-hidden
            data-box-core="bottom"
            style={coreFace(
              coreW,
              coreD,
              `rotateX(-90deg) translateZ(${coreH / 2}px)`,
            )}
          />

          {/* Front / back / spine — keep-case insert or full-bleed cardboard */}
          <div
            aria-hidden
            data-box-face="front"
            style={{ ...frontStyle, ...shellFace() }}
          >
            <div style={insertFrame(keepCase ? "right" : "none")}>
              <img
                ref={frontImgRef}
                src={front}
                alt=""
                draggable={false}
                className={artClass}
                onLoad={(e) => measureFront(e.currentTarget)}
                onError={() => onError?.()}
              />
            </div>
          </div>
          <div
            aria-hidden
            data-box-face="back"
            style={{ ...backStyle, ...shellFace() }}
          >
            <div style={insertFrame(keepCase ? "left" : "none")}>
              <img
                src={back}
                alt=""
                draggable={false}
                className={artClass}
              />
            </div>
          </div>
          <div
            aria-hidden
            data-box-face="left"
            style={{ ...leftStyle, ...shellFace() }}
          >
            {spineArt({ measure: true })}
          </div>
          {keepCase ? (
            <>
              {/* Opening edge + top/bottom: keep-case plastic, not spine art */}
              <div
                aria-hidden
                data-box-face="right"
                style={{ ...rightStyle, ...shellFace() }}
              />
              <div
                aria-hidden
                data-box-face="top"
                style={{ ...topStyle, ...shellFace() }}
              />
              <div
                aria-hidden
                data-box-face="bottom"
                style={{ ...bottomStyle, ...shellFace() }}
              />
              {/* Hairline U-seam + opening-edge finger notch */}
              <div aria-hidden data-box-groove="right" style={grooveEdge("right")} />
              <div aria-hidden data-box-groove="top" style={grooveEdge("top")} />
              <div aria-hidden data-box-groove="bottom" style={grooveEdge("bottom")} />
              <div aria-hidden data-box-finger style={fingerRecess()} />
            </>
          ) : (
            <>
              {/* Cardboard: spine scan wraps all four edge faces */}
              <div
                aria-hidden
                data-box-face="right"
                style={{ ...rightStyle, ...shellFace() }}
              >
                {spineArt()}
              </div>
              <div
                aria-hidden
                data-box-face="top"
                style={{ ...topStyle, ...shellFace() }}
              >
                {spineArt()}
              </div>
              <div
                aria-hidden
                data-box-face="bottom"
                style={{ ...bottomStyle, ...shellFace() }}
              >
                {spineArt()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
