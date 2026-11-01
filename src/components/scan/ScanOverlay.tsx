"use client";

/**
 * Lens-style overlay: one animated frame (guide → card → guide), one line of
 * text. Technical vision rects (ROI, OCR words) only in debug.
 */
import { useSyncExternalStore } from "react";

import {
  getScanDebugSnapshot,
  isScanDebugEnabled,
  subscribeScanDebug,
  type ScanDebugSnapshot,
} from "@/lib/client/scan/scanDebugStore";
import {
  VISION_TONE_FILL,
  VISION_TONE_STROKE,
  type ScanVisionRect,
  type ScanVisionText,
} from "@/lib/client/scan/scanVisionOverlay";
import { cn } from "@/lib/shared/utils";

import { SubjectFrame } from "./SubjectFrame";

export type ScanPhase = "looking" | "understanding" | "delivering";

export type ScanOverlayProps = {
  mode: "auto" | "barcode" | "card";
  phase: ScanPhase;
  hint: string;
  /** Normalized detected card quad TL→TR→BR→BL; null = no edge hit yet. */
  quadNorm?: Array<{ x: number; y: number }> | null;
  sampling?: boolean;
  onTap?: () => void;
  className?: string;
};

function useDebugSnapshot(): ScanDebugSnapshot | null {
  const enabled = useSyncExternalStore(
    subscribeScanDebug,
    isScanDebugEnabled,
    () => false,
  );
  const snap = useSyncExternalStore(
    subscribeScanDebug,
    getScanDebugSnapshot,
    getScanDebugSnapshot,
  );
  return enabled ? snap : null;
}

function useVisionSnapshot(): ScanDebugSnapshot {
  return useSyncExternalStore(
    subscribeScanDebug,
    getScanDebugSnapshot,
    getScanDebugSnapshot,
  );
}

export function ScanOverlay({
  mode,
  phase,
  hint,
  quadNorm,
  sampling,
  onTap,
  className,
}: ScanOverlayProps) {
  const debug = useDebugSnapshot();
  const vision = useVisionSnapshot();
  const locked = phase === "delivering";
  // One frame for the card; a barcode hit borrows it (rect → quad) so the
  // same outline glides onto whatever the camera is reading.
  const barcode = vision.overlays.find((o) => o.tone === "barcode");
  const frameQuad =
    quadNorm && quadNorm.length === 4
      ? quadNorm
      : barcode
        ? rectToQuad(barcode)
        : null;
  // Technical rects (ROI, OCR band, words) are debug-only: the product UI is
  // the frame and one line of text.
  const showVisionDetails = Boolean(debug);

  return (
    <div
      className={cn("absolute inset-0 z-10", className)}
      onClick={onTap}
      role={onTap ? "button" : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={
        onTap
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onTap();
            }
          : undefined
      }
      aria-label={onTap ? hint : undefined}
    >
      <SubjectFrame
        quadNorm={frameQuad}
        locked={locked}
        guideAspect={mode === "barcode" ? 16 / 10 : 63 / 88}
      />

      {showVisionDetails &&
      (vision.overlays.length > 0 || vision.texts.length > 0) ? (
        <svg
          className="absolute inset-0 size-full pointer-events-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {vision.overlays
            .filter((o) => o.tone !== "barcode")
            .map((o) => (
              <VisionSvgRect key={o.id} overlay={o} />
            ))}
          {vision.texts.map((t) => (
            <VisionSvgText key={t.id} item={t} />
          ))}
        </svg>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 pointer-events-none">
        <p
          className={cn(
            "max-w-[86%] rounded-full px-3.5 py-1.5 text-center text-[12px] leading-snug tracking-[0.01em] text-white/95",
            "bg-black/35 backdrop-blur-md ring-1 ring-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
            "transition-colors duration-300",
            locked && "bg-emerald-500/25 ring-emerald-300/30",
          )}
          aria-live="polite"
          data-phase={phase}
        >
          {sampling && phase !== "delivering" ? (
            <span className="inline-flex items-center gap-1 align-middle">
              <Dot delay="0ms" />
              <Dot delay="140ms" />
              <Dot delay="280ms" />
            </span>
          ) : (
            hint
          )}
        </p>
      </div>

      {debug ? (
        <div className="absolute top-2 left-2 right-2 z-30 pointer-events-none">
          <pre className="rounded-lg bg-black/70 text-[9px] leading-tight text-emerald-300/90 p-2 font-mono overflow-hidden max-h-28">
            {`phase=${debug.phase} fps=${debug.fps.toFixed(1)} gate=${debug.gateHint}
blur=${debug.blurVariance.toFixed(0)} lum=${debug.meanLuminance.toFixed(0)} glare=${(debug.glareFraction * 100).toFixed(1)}%
margin=${debug.margin.toFixed(3)} weight=${debug.runWeight.toFixed(2)} aim=${debug.aimToLockMs ?? "—"}ms
method=${debug.method} conf=${debug.confidence} quad=${debug.quadSource} crop=${debug.faceCrop}
embed=${debug.bestEmbedDistance ?? "—"} dhash=${debug.bestDhashDistance ?? "—"} ${debug.bestEmbedKey || ""}
ident=${debug.meanIdentifyMs || "—"}ms ocr=${debug.ocrMs || "—"}ms embed=${debug.embedMs || "—"}ms idle=${debug.idleBackoff ? 1 : 0} ocr=${debug.ocrPreview || "—"}
texts=${debug.texts.length}`}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1 rounded-full bg-white/90 motion-safe:animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

function rectToQuad(r: ScanVisionRect): Array<{ x: number; y: number }> {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

function VisionSvgRect({ overlay }: { overlay: ScanVisionRect }) {
  const stroke = VISION_TONE_STROKE[overlay.tone];
  return (
    <g>
      <rect
        x={overlay.x}
        y={overlay.y}
        width={overlay.w}
        height={overlay.h}
        fill={VISION_TONE_FILL[overlay.tone]}
        stroke={stroke}
        strokeWidth={0.005}
        vectorEffect="non-scaling-stroke"
      />
      {overlay.label ? (
        <text
          x={overlay.x}
          y={Math.max(0.02, overlay.y - 0.018)}
          fill={stroke}
          fontSize={0.024}
          fontFamily="ui-monospace, monospace"
        >
          {overlay.label}
        </text>
      ) : null}
    </g>
  );
}

function VisionSvgText({ item }: { item: ScanVisionText }) {
  const fontSize = Math.max(0.018, Math.min(0.045, item.h * 0.85));
  return (
    <g>
      <rect
        x={item.x}
        y={item.y}
        width={item.w}
        height={item.h}
        fill="rgba(251,191,36,0.2)"
        stroke="rgba(251,191,36,0.85)"
        strokeWidth={0.003}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={item.x + 0.004}
        y={item.y + item.h * 0.78}
        fill="#fde68a"
        fontSize={fontSize}
        fontFamily="ui-monospace, monospace"
        style={{
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.75)",
          strokeWidth: 0.006,
        }}
      >
        {item.text}
      </text>
    </g>
  );
}
