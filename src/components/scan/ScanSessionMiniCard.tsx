"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { ShelfTypeIcon } from "@/components/ShelfTypeIcon";
import type { HydratedScanLock } from "@/lib/client/scan/hydrateScanLock";

export function ScanSessionMiniCard({
  hydrated,
  label,
  faceUrl,
  ownedLabel,
  removeLabel,
  onClick,
  onRemove,
  selected,
  compact,
}: {
  hydrated?: HydratedScanLock | null;
  label: string;
  faceUrl?: string | null;
  ownedLabel?: string;
  removeLabel?: string;
  onClick?: () => void;
  onRemove?: () => void;
  selected?: boolean;
  compact?: boolean;
}) {
  const title = hydrated?.title || label;
  const thumb = hydrated?.imageUrl || faceUrl || null;
  const owned = hydrated?.owned;
  const loading = hydrated?.status === "loading";
  const initials =
    title.trim().substring(0, 2).toUpperCase() || "??";

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-xl border text-left overflow-hidden transition-colors",
        compact ? "w-[7.5rem]" : "w-[9.5rem]",
        selected
          ? "border-primary ring-2 ring-primary/30 bg-white/10"
          : "border-white/15 bg-white/5",
        onClick && "hover:bg-white/10",
      )}
    >
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={removeLabel || "Remove"}
          className="absolute top-1 right-1 z-10 size-6 rounded-full bg-black/70 text-white/90 flex items-center justify-center cursor-pointer hover:bg-black/90 border border-white/15"
        >
          <X className="size-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "w-full text-left",
          onClick ? "cursor-pointer" : "cursor-default",
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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-zinc-800 to-zinc-950 text-muted-foreground px-2">
              {loading ? (
                <span className="text-[10px] text-white/40">…</span>
              ) : (
                <>
                  <ShelfTypeIcon
                    type={hydrated?.shelfType}
                    className="size-5 text-zinc-500"
                  />
                  <span className="text-[9px] font-extrabold tracking-wide uppercase text-zinc-500">
                    {initials}
                  </span>
                </>
              )}
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
    </div>
  );
}
