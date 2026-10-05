"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  opticalDiscBackRecipe,
  type OpticalDiscKind,
} from "@/core/enrich/media/opticalDisc";
import { leanFromPointer, type Lean } from "@/core/render/deviceTilt";
import { cn } from "@/lib/shared/utils";

import { DiscFaceArt } from "./DiscFaceArt";
import { DiscOpticalBack } from "./DiscOpticalBack";
import { showsBack, turnAfterPush, turnTowardBack, turnTowardFace } from "./FlippableCard";

const MAX_TILT = 14;

export type Disc3DProps = {
  frontUrl: string;
  kind?: OpticalDiscKind;
  alt?: string;
  flipLabel: string;
  faceTabLabel?: string;
  backTabLabel?: string;
  className?: string;
  onError?: () => void;
};

function SideTab({
  label,
  active,
  onSelect,
}: {
  label?: string;
  active: boolean;
  onSelect: () => void;
}) {
  if (!label) return null;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide",
        active
          ? "bg-white text-zinc-900"
          : "bg-white/15 text-white hover:bg-white/25",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Loose optical disc: printed face + synthetic underside by {@link OpticalDiscKind}.
 * Flip like a card; iridescence is a CSS conic overlay (no WebGL).
 */
export function Disc3D({
  frontUrl,
  kind = "generic",
  alt = "",
  flipLabel,
  faceTabLabel,
  backTabLabel,
  className,
  onError,
}: Disc3DProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [turn, setTurn] = useState(0);
  const flipped = showsBack(turn);
  const [reducedMotion, setReducedMotion] = useState(false);
  const recipe = opticalDiscBackRecipe(kind);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const applyLean = useCallback((lean: Lean) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.setProperty("--disc-lean-x", `${lean.tiltX}deg`);
    frame.style.setProperty("--disc-lean-y", `${lean.tiltY}deg`);
    frame.style.setProperty("--disc-glare-x", `${lean.lightX}%`);
    frame.style.setProperty("--disc-glare-y", `${lean.lightY}%`);
    // Unitless 0–100 for conic `from` angle math (percent units break calc).
    frame.style.setProperty("--disc-glare-nx", String(lean.lightX));
    frame.style.setProperty("--disc-glare-ny", String(lean.lightY));
  }, []);

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    applyLean(
      leanFromPointer(
        ((e.clientX - rect.left) / rect.width) * 100,
        ((e.clientY - rect.top) / rect.height) * 100,
        MAX_TILT,
      ),
    );
  };

  const onPointerLeave = () => {
    applyLean(leanFromPointer(50, 50, MAX_TILT));
  };

  const push = (fromRightHalf: boolean) => {
    setTurn((previous) => turnAfterPush(previous, fromRightHalf));
  };

  const faceStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    backfaceVisibility: "hidden",
    overflow: "hidden",
  };

  const showTabs = Boolean(faceTabLabel && backTabLabel);

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      {showTabs && (
        <div className="flex items-center gap-2">
          <SideTab
            label={faceTabLabel}
            active={!flipped}
            onSelect={() => setTurn((t) => turnTowardFace(t))}
          />
          <SideTab
            label={backTabLabel}
            active={flipped}
            onSelect={() => setTurn((t) => turnTowardBack(t))}
          />
        </div>
      )}
      <div
        ref={frameRef}
        role="button"
        tabIndex={0}
        aria-label={flipLabel}
        aria-pressed={flipped}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          push(e.clientX > rect.left + rect.width / 2);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            push(true);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn(
          "relative aspect-square w-full max-w-[240px] md:max-w-[320px] cursor-pointer select-none",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          "[perspective:900px]",
        )}
        style={
          {
            "--disc-lean-x": "0deg",
            "--disc-lean-y": "0deg",
            "--disc-glare-x": "50%",
            "--disc-glare-y": "50%",
            "--disc-glare-nx": "50",
            "--disc-glare-ny": "50",
            "--disc-base": recipe.base,
            "--disc-rainbow": String(recipe.rainbow),
          } as CSSProperties
        }
      >
        <div
          className="relative size-full"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(var(--disc-lean-x)) rotateY(calc(var(--disc-lean-y) + ${turn}deg))`,
            transition: reducedMotion
              ? "none"
              : "transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          {/* Front — printed disc art */}
          <div style={{ ...faceStyle, transform: "translateZ(1px)" }}>
            <DiscFaceArt
              src={frontUrl}
              alt={alt}
              mode="img"
              sheen
              onError={onError}
            />
          </div>

          {/* Back — synthetic optical underside */}
          <div
            style={{
              ...faceStyle,
              transform: "rotateY(180deg) translateZ(1px)",
            }}
          >
            <DiscOpticalBack recipe={recipe} />
          </div>
        </div>
      </div>
    </div>
  );
}
