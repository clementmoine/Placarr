"use client";

/**
 * The one outline of the scan UI.
 *
 * At rest: a circle in the centre (mode-agnostic — barcode or card).
 * On detection: the same path springs onto the object quad and the corner
 * radius softens from circle → card. Rounded outline, soft dim outside —
 * nothing else. Frames are written straight to the SVG (no React re-render
 * per animation frame).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  createQuadSpring,
  frameOutlinePath,
  retargetQuadSpring,
  scaleQuadAboutCentre,
  stepQuadSpring,
  type MotionPoint,
  type MotionQuad,
} from "@/lib/client/scan/quadMotion";
import { cn } from "@/lib/shared/utils";

export type SubjectFrameTone = "guide" | "tracking" | "locked";

export type SubjectFrameProps = {
  /** Normalised 0..1 corners (TL→TR→BR→BL) in the overlay box; null = none. */
  quadNorm: ReadonlyArray<MotionPoint> | null | undefined;
  /** Locked = confident match delivered. */
  locked: boolean;
  /** Keep the last detection this long before gliding back to the guide. */
  holdMs?: number;
  /**
   * @deprecated Guide is a circle; kept optional for callers that still pass
   * a card/barcode aspect.
   */
  guideAspect?: number;
  className?: string;
};

/** Soft card corner once the outline has left the circle. */
const FRAME_RADIUS_PX = 18;
/** Dim outside the frame (guide / tracking). */
const DIM_ALPHA = 0.28;
const DEFAULT_HOLD_MS = 450;
/** Resting guide: perfect 32px circle in the viewport centre. */
const GUIDE_DIAMETER_PX = 32;

/** Centred circle guide (axis-aligned square → full corner radius). */
export function guideCircleQuad(w: number, h: number): MotionQuad {
  const d = GUIDE_DIAMETER_PX;
  const x = (w - d) / 2;
  const y = (h - d) / 2;
  return [
    { x, y },
    { x: x + d, y },
    { x: x + d, y: y + d },
    { x, y: y + d },
  ];
}

function toPx(
  q: ReadonlyArray<MotionPoint>,
  w: number,
  h: number,
): MotionQuad | null {
  if (q.length !== 4) return null;
  const out = q.map((p) => ({ x: p.x * w, y: p.y * h }));
  if (!out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    return null;
  }
  return out as MotionQuad;
}

export function SubjectFrame({
  quadNorm,
  locked,
  holdMs = DEFAULT_HOLD_MS,
  className,
}: SubjectFrameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const outlineRef = useRef<SVGPathElement | null>(null);
  const dimRef = useRef<SVGPathElement | null>(null);
  const springRef = useRef<ReturnType<typeof createQuadSpring> | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastDetectedRef = useRef<{ quad: MotionQuad; at: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const [tone, setTone] = useState<SubjectFrameTone>("guide");
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Box size → pixel space (rounded corners and hairline stay uniform).
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const r = host.getBoundingClientRect();
      const next = { w: Math.round(r.width), h: Math.round(r.height) };
      if (next.w !== sizeRef.current.w || next.h !== sizeRef.current.h) {
        sizeRef.current = next;
        setSize(next);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const paint = useCallback((q: MotionQuad) => {
    // Near-square → true circle arcs; once the object stretches it, rounded quad.
    const d = frameOutlinePath(q, FRAME_RADIUS_PX);
    outlineRef.current?.setAttribute("d", d);
    dimRef.current?.setAttribute(
      "d",
      `M0,0H${sizeRef.current.w}V${sizeRef.current.h}H0Z${d}`,
    );
  }, []);

  const kick = useCallback(() => {
    if (rafRef.current != null) return;
    lastTickRef.current = performance.now();
    const loop = (t: number) => {
      rafRef.current = null;
      const spring = springRef.current;
      if (!spring) return;
      const dt = t - lastTickRef.current;
      lastTickRef.current = t;
      paint(stepQuadSpring(spring, dt));
      if (!spring.settled) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [paint]);

  // Target selection: detection (held briefly) or the circle guide.
  useEffect(() => {
    if (!size.w || !size.h) return;
    const now = performance.now();
    const detected = quadNorm ? toPx(quadNorm, size.w, size.h) : null;
    if (detected) lastDetectedRef.current = { quad: detected, at: now };
    const held = lastDetectedRef.current;
    const holding = held && now - held.at < holdMs ? held : null;
    const target = holding?.quad ?? guideCircleQuad(size.w, size.h);

    if (!springRef.current) {
      // First paint: settle in from a touch larger.
      springRef.current = createQuadSpring(scaleQuadAboutCentre(target, 1.06));
    }
    retargetQuadSpring(springRef.current, target);
    setTone(locked ? "locked" : holding ? "tracking" : "guide");
    kick();

    // A held detection expires without any new prop: schedule the glide back.
    if (holding && !detected) {
      const t = setTimeout(
        () => {
          const spring = springRef.current;
          if (!spring) return;
          retargetQuadSpring(
            spring,
            guideCircleQuad(sizeRef.current.w, sizeRef.current.h),
          );
          setTone(locked ? "locked" : "guide");
          kick();
        },
        holdMs - (now - holding.at) + 1,
      );
      return () => clearTimeout(t);
    }
    return undefined;
  }, [quadNorm, size.w, size.h, locked, holdMs, kick]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const stroke =
    tone === "locked"
      ? "rgba(52,211,153,0.98)"
      : tone === "tracking"
        ? "rgba(255,255,255,0.96)"
        : "rgba(255,255,255,0.42)";

  return (
    <div
      ref={hostRef}
      className={cn("absolute inset-0 pointer-events-none", className)}
      aria-hidden
      data-tone={tone}
    >
      {size.w > 0 ? (
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
        >
          <path
            ref={dimRef}
            fill={`rgba(0,0,0,${tone === "locked" ? DIM_ALPHA * 1.4 : DIM_ALPHA})`}
            fillRule="evenodd"
            style={{ transition: "fill 320ms ease" }}
          />
          <path
            ref={outlineRef}
            fill="none"
            stroke={stroke}
            strokeWidth={tone === "guide" ? 1.25 : 1.75}
            strokeLinejoin="round"
            style={{
              transition: "stroke 260ms ease, stroke-width 260ms ease",
              filter: "drop-shadow(0 0 4px rgba(0,0,0,0.35))",
            }}
          />
        </svg>
      ) : null}
    </div>
  );
}
