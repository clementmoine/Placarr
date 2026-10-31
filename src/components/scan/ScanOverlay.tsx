"use client";

/**
 * Lens-style overlay: soft framing guide + live vision (detected card edges,
 * barcode bbox, OCR words drawn on the object).
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

export type ScanPhase = "looking" | "understanding" | "delivering";

export type ScanOverlayProps = {
  mode: "auto" | "barcode" | "card";
  phase: ScanPhase;
  hint: string;
  /** Normalized detected card quad TL→TR→BR→BL; null = no edge hit yet. */
  quadNorm?: Array<{ x: number; y: number }> | null;
  sampling?: boolean;
  tapToScan?: boolean;
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
  tapToScan,
  onTap,
  className,
}: ScanOverlayProps) {
  const debug = useDebugSnapshot();
  const vision = useVisionSnapshot();
  const showBarcodeGuide = mode === "barcode" || mode === "auto";
  const showCardGuide = mode === "card" || mode === "auto";
  const locked = phase === "delivering";
  const hasQuad = Boolean(quadNorm && quadNorm.length === 4);
  const bracketClass = locked
    ? "border-emerald-400"
    : phase === "understanding"
      ? "border-amber-300"
      : "border-white/80";

  return (
    <div
      className={cn("absolute inset-0 z-10", className)}
      onClick={tapToScan ? onTap : undefined}
      role={tapToScan ? "button" : undefined}
      tabIndex={tapToScan ? 0 : undefined}
      onKeyDown={
        tapToScan
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onTap?.();
            }
          : undefined
      }
      aria-label={tapToScan ? hint : undefined}
    >
      {/* Soft framing aid — only when no real edge detection yet */}
      {showCardGuide && !hasQuad ? (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className={cn(
              "w-[78%] max-w-[280px] aspect-[63/88] relative overflow-hidden rounded-xl border transition-colors",
              locked ? "border-emerald-400/80" : "border-white/20",
              "shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]",
            )}
          >
            <Corner bracketClass={bracketClass} pos="tl" />
            <Corner bracketClass={bracketClass} pos="tr" />
            <Corner bracketClass={bracketClass} pos="bl" />
            <Corner bracketClass={bracketClass} pos="br" />
            {showBarcodeGuide && mode === "auto" ? (
              <div className="absolute left-[12%] right-[12%] top-1/2 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent motion-safe:animate-pulse" />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Detected card edges (classical / ONNX) */}
      {hasQuad ? (
        <svg
          className="absolute inset-0 size-full pointer-events-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <polygon
            points={quadNorm!.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(16,185,129,0.1)"
            stroke={locked ? "#34d399" : "#38bdf8"}
            strokeWidth={0.007}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={quadNorm![0]!.x}
            y={Math.max(0.02, quadNorm![0]!.y - 0.02)}
            fill="#7dd3fc"
            fontSize={0.026}
            fontFamily="ui-monospace, monospace"
          >
            card
          </text>
          {/* Dim outside detected card */}
          <path
            d={outsideQuadPath(quadNorm!)}
            fill="rgba(0,0,0,0.4)"
            fillRule="evenodd"
          />
        </svg>
      ) : null}

      {/* Dynamic rects (barcode, OCR band) + word texts on the object */}
      {vision.overlays.length > 0 || vision.texts.length > 0 ? (
        <svg
          className="absolute inset-0 size-full pointer-events-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {vision.overlays.map((o) => (
            <VisionSvgRect key={o.id} overlay={o} />
          ))}
          {vision.texts.map((t) => (
            <VisionSvgText key={t.id} item={t} />
          ))}
        </svg>
      ) : null}

      {/* Barcode-only guide */}
      {mode === "barcode" && !vision.overlays.some((o) => o.tone === "barcode") ? (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className={cn(
              "w-[72%] max-w-[320px] aspect-[16/10] relative rounded-lg border",
              locked ? "border-emerald-400" : "border-white/25",
              "shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]",
            )}
          >
            <Corner bracketClass={bracketClass} pos="tl" />
            <Corner bracketClass={bracketClass} pos="tr" />
            <Corner bracketClass={bracketClass} pos="bl" />
            <Corner bracketClass={bracketClass} pos="br" />
            {!locked ? (
              <div className="absolute inset-x-3 top-1/2 h-0.5 bg-primary/70 motion-safe:animate-pulse" />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
        <p
          className="text-center text-xs text-white/90"
          aria-live="polite"
          data-phase={phase}
        >
          {sampling && phase !== "delivering" ? "…" : hint}
        </p>
        {tapToScan ? (
          <p className="mt-1 text-center text-[10px] text-white/60">
            tap
          </p>
        ) : null}
      </div>

      {debug ? (
        <div className="absolute top-2 left-2 right-2 z-30 pointer-events-none">
          <pre className="rounded-lg bg-black/70 text-[9px] leading-tight text-emerald-300/90 p-2 font-mono overflow-hidden max-h-28">
            {`phase=${debug.phase} fps=${debug.fps.toFixed(1)} gate=${debug.gateHint}
blur=${debug.blurVariance.toFixed(0)} lum=${debug.meanLuminance.toFixed(0)} glare=${(debug.glareFraction * 100).toFixed(1)}%
margin=${debug.margin.toFixed(3)} weight=${debug.runWeight.toFixed(2)} aim=${debug.aimToLockMs ?? "—"}ms
method=${debug.method} conf=${debug.confidence} quad=${debug.quadSource}
embed=${debug.bestEmbedDistance ?? "—"} dhash=${debug.bestDhashDistance ?? "—"} ${debug.bestEmbedKey || ""}
tap=${debug.tapToScan ? 1 : 0} idle=${debug.idleBackoff ? 1 : 0} ocr=${debug.ocrPreview || "—"}
texts=${debug.texts.length}`}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/** Even-odd path: full frame minus the detected quad (vignette). */
function outsideQuadPath(quad: Array<{ x: number; y: number }>): string {
  const hole = quad.map((p) => `${p.x},${p.y}`).join(" ");
  return `M0,0 H1 V1 H0 Z M ${hole} Z`;
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
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 0.006 }}
      >
        {item.text}
      </text>
    </g>
  );
}

function Corner({
  bracketClass,
  pos,
}: {
  bracketClass: string;
  pos: "tl" | "tr" | "bl" | "br";
}) {
  const base = "absolute size-4 border-2 rounded-sm";
  const map = {
    tl: "top-0 left-0 border-r-0 border-b-0 rounded-tl-lg",
    tr: "top-0 right-0 border-l-0 border-b-0 rounded-tr-lg",
    bl: "bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg",
    br: "bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg",
  } as const;
  return <div className={cn(base, bracketClass, map[pos])} />;
}
