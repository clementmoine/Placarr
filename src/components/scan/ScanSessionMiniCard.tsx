"use client";

import { cn } from "@/lib/shared/utils";
import type { HydratedScanLock } from "@/lib/client/scan/hydrateScanLock";

export function ScanSessionMiniCard({
  hydrated,
  label,
  faceUrl,
  ownedLabel,
  onClick,
  selected,
  compact,
}: {
  hydrated?: HydratedScanLock | null;
  label: string;
  faceUrl?: string | null;
  ownedLabel?: string;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}) {
  const title = hydrated?.title || label;
  const thumb = hydrated?.imageUrl || faceUrl || null;
  const owned = hydrated?.owned;
  const loading = hydrated?.status === "loading";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-xl border text-left overflow-hidden cursor-pointer transition-colors",
        compact ? "w-[7.5rem]" : "w-[9.5rem]",
        selected
          ? "border-primary ring-2 ring-primary/30 bg-white/10"
          : "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      <div
        className={cn(
          "relative bg-zinc-800",
          compact ? "aspect-square" : "aspect-[4/3]",
        )}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/40 px-2 text-center">
            {loading ? "…" : "▦"}
          </div>
        )}
        {owned ? (
          <span className="absolute top-1 left-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {ownedLabel || "Owned"}
          </span>
        ) : null}
      </div>
      <div className="px-2 py-1.5 space-y-0.5">
        <p className="text-[11px] font-semibold text-white truncate leading-tight">
          {title}
        </p>
        {owned?.shelfName ? (
          <p className="text-[9px] text-emerald-300/90 truncate">
            {owned.shelfName}
          </p>
        ) : null}
      </div>
    </button>
  );
}
