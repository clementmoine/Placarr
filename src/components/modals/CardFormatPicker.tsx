"use client";

import { cn } from "@/lib/shared/utils";
import {
  coerceCardFormatForType,
  getAspectRatio,
  getCardFormatsForPicker,
  type CardFormat,
} from "@/lib/text/cardFormat";
import type { Type } from "@/generated/prisma/browser";

const PREVIEW_BOX_PX = 36;

type CardFormatPickerProps = {
  value: string;
  onChange: (value: CardFormat) => void;
  shelfType?: Type | string | null;
  getLabel: (format: CardFormat) => string;
  getDescription: (format: CardFormat) => string;
};

function shapeSize(aspectRatio: string): { width: number; height: number } {
  const [ratioW = 1, ratioH = 1] = aspectRatio
    .split("/")
    .map((part) => Number.parseFloat(part.trim()));
  const safeW = Number.isFinite(ratioW) && ratioW > 0 ? ratioW : 1;
  const safeH = Number.isFinite(ratioH) && ratioH > 0 ? ratioH : 1;

  if (safeW >= safeH) {
    const width = PREVIEW_BOX_PX;
    return { width, height: (width * safeH) / safeW };
  }
  const height = PREVIEW_BOX_PX;
  return { width: (height * safeW) / safeH, height };
}

export function CardFormatPicker({
  value,
  onChange,
  shelfType,
  getLabel,
  getDescription,
}: CardFormatPickerProps) {
  const formats = getCardFormatsForPicker(shelfType);
  const effectiveValue = coerceCardFormatForType(value, shelfType);

  return (
    <div
      role="radiogroup"
      aria-label="Card format"
      className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent"
    >
      {formats.map((format) => {
        const selected = effectiveValue === format;
        const aspectRatio = getAspectRatio(
          format === "default" ? null : format,
          shelfType,
        );
        const size = shapeSize(aspectRatio);

        return (
          <button
            key={format}
            type="button"
            role="radio"
            aria-checked={selected}
            title={getDescription(format)}
            onClick={() => onChange(format)}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1.5 rounded-xl px-2.5 py-2 transition-all duration-150 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              selected
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100/90 text-muted-foreground hover:bg-zinc-200/80 dark:bg-zinc-900/70 dark:hover:bg-zinc-800",
            )}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: PREVIEW_BOX_PX, height: PREVIEW_BOX_PX }}
            >
              <div
                aria-hidden
                className={cn(
                  "rounded-[4px] transition-colors",
                  selected
                    ? "bg-white/85 dark:bg-zinc-900/80"
                    : "bg-zinc-400/80 dark:bg-zinc-500/70",
                )}
                style={{
                  width: size.width,
                  height: size.height,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold leading-none whitespace-nowrap">
              {getLabel(format)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
